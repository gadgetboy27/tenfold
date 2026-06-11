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
  };
  requestId: string;
}

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

    if (result.data?.audio_file) {
      const assetId = uuidv4();
      const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.mp3`;
      let publicUrl = result.data.audio_file.url;
      let storedPath: string | null = null;
      try {
        const audioRes = await fetch(result.data.audio_file.url, {
          signal: AbortSignal.timeout(60_000),
        });
        const buffer = await audioRes.arrayBuffer();
        const { error: upErr } = await admin.storage
          .from("assets")
          .upload(storagePath, buffer, {
            contentType: result.data.audio_file.content_type ?? "audio/mpeg",
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

    // If the webhook already processed this job, assets may be duplicated — that's acceptable.
    await admin
      .from("creative_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "processing");
  } catch {
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
    try {
      const status = await fal.queue.status(modelId, {
        requestId: d.requestId,
      });
      if (status.status !== "COMPLETED") continue;
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
      // skip this direction; retry on the next poll
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
