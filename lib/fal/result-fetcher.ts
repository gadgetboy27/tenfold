import { fal } from "./client";
import { FAL_MODELS, FAL_QUEUE_MODELS, type FalModelKey } from "./models";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";

interface StuckJob {
  id: string;
  campaign_id: string;
  workspace_id: string;
  type: string;
  fal_request_id: string;
}

interface FalResult {
  data: {
    images?: Array<{
      url: string;
      width?: number;
      height?: number;
      content_type?: string;
    }>;
    video?: { url: string; content_type?: string };
    audio_file?: { url: string; content_type?: string };
    // ACE-Step (vocals) returns `audio` rather than `audio_file`.
    audio?: { url: string; content_type?: string };
  };
  requestId: string;
}

/**
 * Claim one fal request for whichever path gets there first.
 *
 * The webhook and this poller both save a request's assets, and both used to
 * do it. The webhook is idempotent via the unique index on
 * `webhook_logs (source, event_id)`; this poller only ever checked a SNAPSHOT
 * of already-saved assets taken before it started, then spent ten-plus seconds
 * downloading and re-uploading images. Every webhook that landed inside that
 * window was invisible to it, so it inserted a second copy anyway — which is
 * how 8.5% of image requests ended up duplicated.
 *
 * A snapshot can't fix a race; a claim can. Both paths now compete for the
 * same unique row BEFORE doing any work, so exactly one of them owns a given
 * request. Losing the claim is the normal, expected outcome — not an error.
 */
export async function claimFalRequest(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  requestId: string,
): Promise<boolean> {
  const { error } = await admin.from("webhook_logs").insert({
    source: "fal",
    event_id: requestId,
    payload: { claimed_by: CLAIM_MARKER },
    processed: true,
  });
  if (!error) return true;
  if (error.code === "23505") return false; // the webhook (or an earlier poll) owns it
  // Anything else is unknown — refuse rather than risk double-saving.
  return false;
}

/**
 * Give a claim back when the work behind it failed, so the real webhook (or the
 * next poll) can still deliver the image. Scoped to rows THIS module wrote —
 * deleting a genuine webhook log would destroy the payload and the audit trail.
 */
export async function releaseFalRequest(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  requestId: string,
): Promise<void> {
  await admin
    .from("webhook_logs")
    .delete()
    .eq("source", "fal")
    .eq("event_id", requestId)
    .eq("payload->>claimed_by", CLAIM_MARKER);
}

/** Marks a webhook_logs row as a poller claim rather than a real delivery. */
const CLAIM_MARKER = "result-fetcher";

export async function fetchAndProcessFalJob(job: StuckJob): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  // Multi-image generation (4 directions, one fal request each) needs every
  // direction polled — not just the single fal_request_id — or it would
  // complete prematurely with one image.
  const { data: meta } = await admin
    .from("creative_jobs")
    .select("input_params")
    .eq("id", job.id)
    .single();
  const ip = meta?.input_params as Record<string, unknown> | undefined;
  const mDirections =
    (ip?.directions as
      | Array<{ index: number; label: string; requestId?: string }>
      | undefined) ?? [];
  const mExpected = Number(ip?.expected_images ?? 0);
  if (mExpected > 1 && mDirections.length > 0) {
    return fetchMultiImage(job, mDirections, mExpected);
  }

  const jobType = job.type as FalModelKey;
  // Use queue alias (base path) for status/result — versioned submit paths differ from queue paths
  const modelId = FAL_QUEUE_MODELS[jobType] ?? FAL_MODELS[jobType] ?? job.type;

  try {
    const status = await fal.queue.status(modelId, {
      requestId: job.fal_request_id,
    });
    if ((status.status as string) === "FAILED") {
      await admin
        .from("creative_jobs")
        .update({
          status: "failed",
          error_message:
            "Generation failed on fal.ai — the model was unable to process your request",
        })
        .eq("id", job.id)
        .eq("status", "processing");
      return true;
    }
    if (status.status !== "COMPLETED") return false;
  } catch {
    return false;
  }

  // Claim before any work. If the webhook already owns this request it has
  // saved (or is saving) the assets, and a second copy is not "acceptable" —
  // it is the duplicate the user sees in their options grid.
  if (!(await claimFalRequest(admin, job.fal_request_id))) return false;

  try {
    const result = (await fal.queue.result(modelId as FalModelKey, {
      requestId: job.fal_request_id,
    })) as FalResult;

    const assetInserts: Record<string, unknown>[] = [];

    for (const img of result.data?.images ?? []) {
      const assetId = uuidv4();
      const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.jpg`;
      const imgRes = await fetch(img.url);
      const buffer = await imgRes.arrayBuffer();
      await admin.storage
        .from("assets")
        .upload(storagePath, buffer, {
          contentType: img.content_type ?? "image/jpeg",
        });
      const { data: urlData } = admin.storage
        .from("assets")
        .getPublicUrl(storagePath);
      assetInserts.push({
        id: assetId,
        campaign_id: job.campaign_id,
        workspace_id: job.workspace_id,
        job_id: job.id,
        type: "image",
        url: urlData.publicUrl,
        storage_path: storagePath,
        width_px: img.width,
        height_px: img.height,
      });
    }

    if (result.data?.video) {
      const assetId = uuidv4();
      const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.mp4`;
      let publicUrl = result.data.video.url;
      let storedPath: string | null = null;
      try {
        const videoRes = await fetch(result.data.video.url, {
          signal: AbortSignal.timeout(90_000),
        });
        const buffer = await videoRes.arrayBuffer();
        const { error: upErr } = await admin.storage
          .from("assets")
          .upload(storagePath, buffer, {
            contentType: result.data.video.content_type ?? "video/mp4",
          });
        if (!upErr) {
          const { data: urlData } = admin.storage
            .from("assets")
            .getPublicUrl(storagePath);
          publicUrl = urlData.publicUrl;
          storedPath = storagePath;
        }
      } catch {
        // Fallback to fal CDN URL
      }
      assetInserts.push({
        id: assetId,
        campaign_id: job.campaign_id,
        workspace_id: job.workspace_id,
        job_id: job.id,
        type: "video",
        url: publicUrl,
        storage_path: storedPath,
      });
    }

    const audioResult = result.data?.audio_file ?? result.data?.audio;
    if (audioResult) {
      const assetId = uuidv4();
      const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.mp3`;
      let publicUrl = audioResult.url;
      let storedPath: string | null = null;
      try {
        const audioRes = await fetch(audioResult.url, {
          signal: AbortSignal.timeout(60_000),
        });
        const buffer = await audioRes.arrayBuffer();
        const { error: upErr } = await admin.storage
          .from("assets")
          .upload(storagePath, buffer, {
            contentType: audioResult.content_type ?? "audio/mpeg",
          });
        if (!upErr) {
          const { data: urlData } = admin.storage
            .from("assets")
            .getPublicUrl(storagePath);
          publicUrl = urlData.publicUrl;
          storedPath = storagePath;
        }
      } catch {
        // Fallback to fal CDN URL
      }
      assetInserts.push({
        id: assetId,
        campaign_id: job.campaign_id,
        workspace_id: job.workspace_id,
        job_id: job.id,
        type: "audio",
        url: publicUrl,
        storage_path: storedPath,
      });
    }

    // Insert assets FIRST, then atomically claim the job as completed.
    // This eliminates the race window where a concurrent poll sees completed+no-assets.
    if (assetInserts.length > 0) {
      await admin.from("assets").insert(assetInserts);
    }

    await admin
      .from("creative_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "processing");
  } catch {
    // Hand the claim back before retreating, or the webhook that arrives next
    // would be turned away as a duplicate and the image lost for good.
    await releaseFalRequest(admin, job.fal_request_id);
    // Revert job status so polling can retry
    await admin
      .from("creative_jobs")
      .update({ status: "processing", completed_at: null })
      .eq("id", job.id);
    return false;
  }

  return true;
}

// Fallback for multi-image jobs: poll every direction's fal request, save any
// completed images not yet stored (deduped by metadata.request_id), and only
// complete the job once all expected images have landed.
async function fetchMultiImage(
  job: StuckJob,
  directions: Array<{ index: number; label: string; requestId?: string }>,
  expected: number,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const modelId =
    FAL_QUEUE_MODELS.image_generation ??
    FAL_MODELS.image_generation ??
    "image_generation";

  // A cheap pre-filter only — it is a SNAPSHOT and says nothing about what
  // lands while the loop below is downloading. The claim is the real guard.
  const { data: existing } = await admin
    .from("assets")
    .select("metadata")
    .eq("job_id", job.id)
    .eq("type", "image");
  const savedReqIds = new Set(
    (existing ?? [])
      .map((a) => (a.metadata as { request_id?: string } | null)?.request_id)
      .filter(Boolean) as string[],
  );

  const inserts: Record<string, unknown>[] = [];
  for (const d of directions) {
    if (!d.requestId || savedReqIds.has(d.requestId)) continue;
    // Claimed per direction, not per job: each direction is its own fal
    // request with its own webhook, so they are won and lost independently.
    if (!(await claimFalRequest(admin, d.requestId))) continue;
    let claimed = true;
    try {
      const status = await fal.queue.status(modelId, {
        requestId: d.requestId,
      });
      if (status.status !== "COMPLETED") {
        // Not ready — give it back so the webhook isn't locked out.
        await releaseFalRequest(admin, d.requestId);
        claimed = false;
        continue;
      }
      const result = (await fal.queue.result(modelId as FalModelKey, {
        requestId: d.requestId,
      })) as FalResult;
      for (const img of result.data?.images ?? []) {
        const assetId = uuidv4();
        const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.jpg`;
        const imgRes = await fetch(img.url);
        const buffer = await imgRes.arrayBuffer();
        await admin.storage
          .from("assets")
          .upload(storagePath, buffer, {
            contentType: img.content_type ?? "image/jpeg",
          });
        const { data: urlData } = admin.storage
          .from("assets")
          .getPublicUrl(storagePath);
        inserts.push({
          id: assetId,
          campaign_id: job.campaign_id,
          workspace_id: job.workspace_id,
          job_id: job.id,
          type: "image",
          url: urlData.publicUrl,
          storage_path: storagePath,
          width_px: img.width,
          height_px: img.height,
          metadata: {
            direction: d.label,
            direction_index: d.index,
            request_id: d.requestId,
          },
        });
      }
    } catch {
      // skip this direction; retry on the next poll — but only after handing
      // the claim back, or nothing can ever deliver it.
      if (claimed) await releaseFalRequest(admin, d.requestId);
    }
  }

  if (inserts.length > 0) {
    await admin.from("assets").insert(inserts);
  }

  const { count } = await admin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id)
    .eq("type", "image");

  if ((count ?? 0) >= expected) {
    await admin
      .from("creative_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "processing");
    await admin
      .from("campaigns")
      .update({ status: "ready" })
      .eq("id", job.campaign_id)
      .in("status", ["generating", "expanding"]);
    return true;
  }

  return false; // still waiting for more directions
}
