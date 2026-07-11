import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { falWebhookPayloadSchema, isSuccessStatus } from "@/lib/fal/webhooks";
import { refundCredits } from "@/lib/credits/refund";
import { recordJobCost } from "@/lib/costs/tracker";
import { analyzeJobFailure } from "@/lib/fal/error-analyzer";
import { concatVideos } from "@/lib/composition/concat";
import { v4 as uuidv4 } from "uuid";

interface CreativeJob {
  id: string;
  campaign_id: string;
  workspace_id: string;
  type: string;
  status: string;
  credits_charged: number;
  input_params: Record<string, unknown>;
  fal_request_id: string | null;
}

export async function POST(req: Request) {
  const rawPayload: unknown = await req.json();
  const admin = createSupabaseAdminClient();

  // Extract request_id from raw payload before schema validation
  const requestId = (rawPayload as Record<string, unknown>)?.request_id as
    | string
    | undefined;
  if (!requestId) return NextResponse.json({ ok: true }); // not a fal.ai payload

  // 1. Log FIRST — always, even if schema validation fails below.
  //    Duplicate webhooks hit the unique constraint and return early.
  const { error: logErr } = await admin.from("webhook_logs").insert({
    source: "fal",
    event_id: requestId,
    payload: rawPayload as Record<string, unknown>,
  });

  if (logErr) {
    if (logErr.code === "23505") return NextResponse.json({ ok: true }); // duplicate
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  // 2. Validate schema — but NEVER return 4xx (fal.ai would retry forever).
  //    Log the parse error and return 200 so we can debug via webhook_logs.
  const parsed = falWebhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    await admin
      .from("webhook_logs")
      .update({ error: JSON.stringify(parsed.error.issues), processed: true })
      .eq("event_id", requestId);
    return NextResponse.json({ ok: true });
  }
  const payload = parsed.data;

  // fal.ai may nest results under 'payload' or 'output' depending on model/version.
  // Prefer whichever wrapper actually contains media — empty {} is truthy and would mask real output.
  const hasMedia = (d: typeof payload.payload) =>
    !!(d?.images?.length || d?.video || d?.audio_file);
  const resultData = hasMedia(payload.payload)
    ? payload.payload
    : (payload.output ?? payload.payload);

  // 3. Locate the job — prefer lookup by ?j=jobId (more secure) then fall back to fal_request_id
  const jobId = new URL(req.url).searchParams.get("j");
  const jobQuery = admin
    .from("creative_jobs")
    .select(
      "id, campaign_id, workspace_id, type, status, credits_charged, input_params, fal_request_id",
    );

  const { data: jobRow } = jobId
    ? await jobQuery.eq("id", jobId).single()
    : await jobQuery.eq("fal_request_id", requestId).single();

  const job = jobRow as CreativeJob | null;

  // Multi-image generation submits one fal request per creative direction, all
  // tied to one job. Valid request ids = the stored fal_request_id plus every
  // per-direction requestId. Verify against that set to prevent spoofing.
  const directions =
    (job?.input_params?.directions as
      | Array<{
          index: number;
          label: string;
          prompt?: string;
          requestId?: string;
        }>
      | undefined) ?? [];
  // Video_30s ties two segment fal requests to one job (like directions).
  const segments =
    (job?.input_params?.segments as
      | Array<{ index: number; requestId?: string }>
      | undefined) ?? [];
  const validRequestIds = new Set<string>(
    [
      job?.fal_request_id,
      ...directions.map((d) => d.requestId),
      ...segments.map((s) => s.requestId),
    ].filter(Boolean) as string[],
  );
  if (
    jobId &&
    job &&
    validRequestIds.size > 0 &&
    !validRequestIds.has(requestId)
  ) {
    await admin
      .from("webhook_logs")
      .update({ error: "request_id mismatch", processed: true })
      .eq("event_id", requestId);
    return NextResponse.json({ ok: true });
  }

  // Which creative direction is this webhook for? (?d=index, else match by requestId)
  const dParam = new URL(req.url).searchParams.get("d");
  const dIndex = dParam !== null && dParam !== "" ? Number(dParam) : null;
  const direction =
    directions.find((d) => d.index === dIndex) ??
    directions.find((d) => d.requestId === requestId) ??
    null;

  // Which video segment is this? (?seg=index, else match by requestId)
  const segParam = new URL(req.url).searchParams.get("seg");
  const segIndex =
    segParam !== null && segParam !== ""
      ? Number(segParam)
      : (segments.find((s) => s.requestId === requestId)?.index ?? null);

  if (!job) {
    await admin
      .from("webhook_logs")
      .update({ error: "Unknown job", processed: true })
      .eq("event_id", requestId);
    return NextResponse.json({ ok: true });
  }

  // If the job was cancelled server-side, acknowledge and ignore
  if (job.status === "cancelled") {
    await admin
      .from("webhook_logs")
      .update({ processed: true })
      .eq("event_id", requestId);
    return NextResponse.json({ ok: true });
  }

  if (isSuccessStatus(payload.status) && resultData) {
    await handleSuccess(
      job,
      resultData as Parameters<typeof handleSuccess>[1],
      direction,
      segIndex,
    );
  } else {
    const errMsg =
      typeof payload.error === "string" ? payload.error : "fal.ai job failed";
    await handleFailure(job, errMsg, resultData);
  }

  // 4. Mark processed
  await admin
    .from("webhook_logs")
    .update({ processed: true })
    .eq("event_id", requestId);

  return NextResponse.json({ ok: true });
}

type ResultData = {
  images?: Array<{
    url: string;
    width?: number;
    height?: number;
    content_type?: string;
  }>;
  video?: { url: string; content_type?: string };
  audio_file?: { url: string; content_type?: string };
};

async function handleSuccess(
  job: CreativeJob,
  payload: ResultData,
  direction: {
    index: number;
    label: string;
    prompt?: string;
    requestId?: string;
  } | null = null,
  segIndex: number | null = null,
) {
  const admin = createSupabaseAdminClient();
  const assetInserts: Record<string, unknown>[] = [];

  if (payload.images) {
    for (const img of payload.images) {
      const assetId = uuidv4();
      const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.jpg`;

      const imgRes = await fetch(img.url);
      const buffer = await imgRes.arrayBuffer();
      await admin.storage.from("assets").upload(storagePath, buffer, {
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
        metadata: direction
          ? {
              direction: direction.label,
              direction_index: direction.index,
              prompt: direction.prompt,
              request_id: direction.requestId,
            }
          : job.type === "upscale"
            ? {
                hd: true,
                source_asset_id: job.input_params?.source_asset_id ?? null,
                upscale_factor: 2,
              }
            : {},
      });
    }
  }

  if (payload.video) {
    const assetId = uuidv4();
    const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.mp4`;
    let publicUrl = payload.video.url;
    let storedPath: string | null = null;
    try {
      const videoRes = await fetch(payload.video.url, {
        signal: AbortSignal.timeout(90_000),
      });
      const buffer = await videoRes.arrayBuffer();
      const { error: upErr } = await admin.storage
        .from("assets")
        .upload(storagePath, buffer, {
          contentType: payload.video.content_type ?? "video/mp4",
        });
      if (!upErr) {
        const { data: urlData } = admin.storage
          .from("assets")
          .getPublicUrl(storagePath);
        publicUrl = urlData.publicUrl;
        storedPath = storagePath;
      }
    } catch {
      // Fallback to fal CDN URL — it may expire but is better than nothing
    }
    // Multi-segment 30s: store this as an intermediate video_segment (tagged with
    // its index), then let the finalizer stitch once every segment has landed.
    const expectedSegments = Number(job.input_params?.expected_segments ?? 0);
    if (expectedSegments > 1) {
      await admin.from("assets").insert({
        id: assetId,
        campaign_id: job.campaign_id,
        workspace_id: job.workspace_id,
        job_id: job.id,
        type: "video_segment",
        url: publicUrl,
        storage_path: storedPath ?? `fal/${assetId}.mp4`,
        metadata: { segment_index: segIndex ?? 0 },
      });
      await finalizeMultiSegment(job, expectedSegments);
      return;
    }
    assetInserts.push({
      id: assetId,
      campaign_id: job.campaign_id,
      workspace_id: job.workspace_id,
      job_id: job.id,
      type: "video",
      url: publicUrl,
      storage_path: storedPath ?? `fal/${assetId}.mp4`,
    });
  }

  if (payload.audio_file) {
    const assetId = uuidv4();
    // fal serves music as application/octet-stream, which the bucket rejected —
    // so the URL stayed on fal's CDN and expired in ~1-2 days. Pick a real audio
    // content-type from the file extension so the Supabase upload succeeds and
    // the music URL becomes permanent.
    const isWav = payload.audio_file.url
      .toLowerCase()
      .split("?")[0]
      .endsWith(".wav");
    const ext = isWav ? "wav" : "mp3";
    const contentType = isWav ? "audio/wav" : "audio/mpeg";
    const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.${ext}`;
    let publicUrl = payload.audio_file.url;
    let storedPath: string | null = null;
    try {
      const audioRes = await fetch(payload.audio_file.url, {
        signal: AbortSignal.timeout(60_000),
      });
      const buffer = await audioRes.arrayBuffer();
      const { error: upErr } = await admin.storage
        .from("assets")
        .upload(storagePath, buffer, { contentType });
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
      storage_path: storedPath ?? `fal/${assetId}.${ext}`,
    });
  }

  if (assetInserts.length > 0) {
    await admin.from("assets").insert(assetInserts);
  }

  // Multi-image generation (4 directions, one fal request each) completes only
  // once all expected images have landed — not on the first webhook.
  const expected = Number(job.input_params?.expected_images ?? 0);
  if (expected > 1) {
    await finalizeMultiImage(job, expected);
    return;
  }

  await admin
    .from("creative_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", job.id);

  // Propagate completion back to the campaign row so the lobby shows correct status
  await admin
    .from("campaigns")
    .update({ status: "ready" })
    .eq("id", job.campaign_id)
    .in("status", ["generating", "expanding"]); // only advance, never revert

  await recordJobCost(job.id, job.type);
}

// Completion gate for multi-request image generation. Each direction's webhook
// (success or failure) calls this; it inspects how many images have arrived and
// how many sub-requests have reported, then finalizes once all are accounted for.
async function finalizeMultiImage(job: CreativeJob, expected: number) {
  const admin = createSupabaseAdminClient();

  const { count: assetCount } = await admin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id)
    .eq("type", "image");

  const directions =
    (job.input_params?.directions as
      | Array<{ requestId?: string }>
      | undefined) ?? [];
  const reqIds = directions.map((d) => d.requestId).filter(Boolean) as string[];
  const { count: arrivedCount } = reqIds.length
    ? await admin
        .from("webhook_logs")
        .select("event_id", { count: "exact", head: true })
        .in("event_id", reqIds)
    : { count: 0 };

  const images = assetCount ?? 0;
  const arrived = arrivedCount ?? 0;

  const complete = async () => {
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
    await recordJobCost(job.id, job.type);
  };

  if (images >= expected) {
    // All directions delivered.
    await complete();
  } else if (arrived >= expected) {
    // Every sub-request has reported; some failed. Partial success is still a
    // usable anchor set — only fail (and refund) if nothing rendered.
    if (images >= 1) {
      await complete();
    } else {
      await admin
        .from("creative_jobs")
        .update({
          status: "failed",
          error_message: "All image variations failed on fal.ai",
        })
        .eq("id", job.id)
        .eq("status", "processing");
      await admin
        .from("campaigns")
        .update({ status: "failed" })
        .eq("id", job.campaign_id);
      await refundCredits(job.id);
    }
  }
  // else: still waiting for more direction webhooks — leave processing.
}

/**
 * Completion gate for the real 30s video (2× 15s Kling v3 segments). Each
 * segment's webhook (success or failure) calls this. Once all segments have
 * landed as video_segment assets, exactly ONE webhook wins an atomic claim
 * (processing → stitching) and concatenates them into the final `video` asset;
 * if every segment webhook has reported but the full set didn't land, the clip
 * failed → refund. A partial 30s is not a usable video, so we require ALL.
 */
async function finalizeMultiSegment(job: CreativeJob, expected: number) {
  const admin = createSupabaseAdminClient();

  const { data: segAssets } = await admin
    .from("assets")
    .select("id, url, storage_path, metadata")
    .eq("job_id", job.id)
    .eq("type", "video_segment");
  const segs = (segAssets ?? []) as Array<{
    id: string;
    url: string;
    storage_path: string;
    metadata: { segment_index?: number } | null;
  }>;

  const segments =
    (job.input_params?.segments as Array<{ requestId?: string }> | undefined) ??
    [];
  const reqIds = segments.map((s) => s.requestId).filter(Boolean) as string[];
  const { count: arrivedCount } = reqIds.length
    ? await admin
        .from("webhook_logs")
        .select("event_id", { count: "exact", head: true })
        .in("event_id", reqIds)
    : { count: 0 };
  const arrived = arrivedCount ?? 0;

  if (segs.length >= expected) {
    // Claim the stitch atomically — only one concurrent webhook wins.
    const { data: claimed } = await admin
      .from("creative_jobs")
      .update({ status: "stitching" })
      .eq("id", job.id)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return; // another webhook is stitching

    try {
      const ordered = [...segs].sort(
        (a, b) =>
          (a.metadata?.segment_index ?? 0) - (b.metadata?.segment_index ?? 0),
      );
      const { url, storagePath } = await concatVideos({
        urls: ordered.map((s) => s.url),
        workspaceId: job.workspace_id,
        campaignId: job.campaign_id,
        name: job.id,
      });
      await admin.from("assets").insert({
        id: uuidv4(),
        campaign_id: job.campaign_id,
        workspace_id: job.workspace_id,
        job_id: job.id,
        type: "video",
        url,
        storage_path: storagePath,
      });
      // Tidy the intermediate segments (best-effort — they're not user-facing).
      const paths = segs
        .map((s) => s.storage_path)
        .filter((p) => p && !p.startsWith("fal/"));
      if (paths.length)
        await admin.storage
          .from("assets")
          .remove(paths)
          .catch(() => {});
      await admin
        .from("assets")
        .delete()
        .eq("job_id", job.id)
        .eq("type", "video_segment");

      await admin
        .from("creative_jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      await admin
        .from("campaigns")
        .update({ status: "ready" })
        .eq("id", job.campaign_id)
        .in("status", ["generating", "expanding"]);
      await recordJobCost(job.id, job.type);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Video stitch failed";
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: msg })
        .eq("id", job.id);
      await admin
        .from("campaigns")
        .update({ status: "failed" })
        .eq("id", job.campaign_id);
      await refundCredits(job.id);
    }
    return;
  }

  // Not all segments landed. If every segment webhook has reported, one failed →
  // fail + refund (idempotent). Otherwise keep waiting.
  if (arrived >= expected) {
    await admin
      .from("creative_jobs")
      .update({
        status: "failed",
        error_message: "A video segment failed to render",
      })
      .eq("id", job.id)
      .eq("status", "processing");
    await admin
      .from("campaigns")
      .update({ status: "failed" })
      .eq("id", job.campaign_id);
    await refundCredits(job.id);
  }
}

async function handleFailure(
  job: CreativeJob,
  errorMessage: string,
  rawErrorPayload: unknown,
) {
  const admin = createSupabaseAdminClient();

  // Multi-image generation: one direction failing must not fail the whole
  // campaign. Defer to the completion gate, which fails+refunds only if every
  // direction failed and zero images rendered.
  const expected = Number(job.input_params?.expected_images ?? 0);
  if (expected > 1) {
    await finalizeMultiImage(job, expected);
    return;
  }

  // Multi-segment 30s video: any segment failing kills the clip (a partial 30s
  // is unusable). Defer to the segment gate, which fails+refunds once every
  // segment webhook has reported and the full set didn't land.
  const expectedSegments = Number(job.input_params?.expected_segments ?? 0);
  if (expectedSegments > 1) {
    await finalizeMultiSegment(job, expectedSegments);
    return;
  }

  const prompt = (job.input_params?.prompt as string) ?? "";

  // Fire-and-forget Claude analysis — refund happens regardless of analysis success
  const analysisPromise = analyzeJobFailure({
    jobType: job.type,
    prompt,
    errorMessage,
    rawError: rawErrorPayload,
  }).catch(() => null);

  // Refund credits immediately — don't wait on Claude
  await admin
    .from("creative_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      fal_raw_error: rawErrorPayload as Record<string, unknown>,
    })
    .eq("id", job.id);

  await refundCredits(job.id);

  // If the image generation itself failed, the campaign has no assets — mark it failed
  if (job.type === "image_generation") {
    await admin
      .from("campaigns")
      .update({ status: "failed" })
      .eq("id", job.campaign_id);
  }

  // Store analysis once Claude responds (doesn't block the webhook response)
  analysisPromise.then(async (analysis) => {
    if (!analysis) return;
    await admin
      .from("creative_jobs")
      .update({
        error_analysis: analysis.explanation,
        suggested_prompt: analysis.suggestedPrompt,
      })
      .eq("id", job.id);
  });
}
