import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { falWebhookPayloadSchema, isSuccessStatus } from "@/lib/fal/webhooks";
import { SWEPT_MARKER } from "@/lib/jobs/sweep";
import {
  extractFalError,
  handleFailure,
  handleSuccess,
  type CreativeJob,
  type JobDirection,
} from "@/lib/fal/handle-result";

// Receives fal's callback and hands the result to lib/fal/handle-result.ts.
// The saving itself deliberately does NOT live here: the logo poller
// (lib/logo/reclaim.ts) reclaims requests whose webhook is late, and both
// paths must produce the identical asset.

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
    !!(d?.images?.length || d?.image || d?.video || d?.audio_file || d?.audio);
  const rawResult = hasMedia(payload.payload)
    ? payload.payload
    : (payload.output ?? payload.payload);
  // ACE-Step (vocals) returns `audio`; the save path below reads `audio_file`.
  const resultData =
    rawResult && rawResult.audio && !rawResult.audio_file
      ? { ...rawResult, audio_file: rawResult.audio }
      : rawResult;

  // 3. Locate the job — prefer lookup by ?j=jobId (more secure) then fall back to fal_request_id
  const jobId = new URL(req.url).searchParams.get("j");
  const jobQuery = admin
    .from("creative_jobs")
    .select(
      "id, campaign_id, workspace_id, type, status, credits_charged, input_params, fal_request_id, fal_raw_error",
    );

  const { data: jobRow } = jobId
    ? await jobQuery.eq("id", jobId).single()
    : await jobQuery.eq("fal_request_id", requestId).single();

  const job = jobRow as CreativeJob | null;

  // Multi-image generation submits one fal request per creative direction, all
  // tied to one job. Valid request ids = the stored fal_request_id plus every
  // per-direction requestId. Verify against that set to prevent spoofing.
  const directions =
    (job?.input_params?.directions as JobDirection[] | undefined) ?? [];
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

  // Same reasoning, for a job the stalled-job sweeper already settled: its
  // credits have been refunded, so processing this now would hand the user the
  // asset AND their money back. Gated on the sweeper's own marker rather than
  // `status === "failed"` — a multi-direction job is marked failed by the first
  // failing direction while its siblings are still legitimately in flight, and
  // blanket-ignoring failed jobs would drop those.
  if (job.fal_raw_error?.swept_by === SWEPT_MARKER) {
    await admin
      .from("webhook_logs")
      .update({ error: "job already swept", processed: true })
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
    await handleFailure(job, extractFalError(payload), resultData);
  }

  // 4. Mark processed
  await admin
    .from("webhook_logs")
    .update({ processed: true })
    .eq("event_id", requestId);

  return NextResponse.json({ ok: true });
}
