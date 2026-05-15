import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { falWebhookPayloadSchema, isSuccessStatus } from '@/lib/fal/webhooks';
import { refundCredits } from '@/lib/credits/refund';
import { recordJobCost } from '@/lib/costs/tracker';
import { analyzeJobFailure } from '@/lib/fal/error-analyzer';
import { v4 as uuidv4 } from 'uuid';

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
  const requestId = (rawPayload as Record<string, unknown>)?.request_id as string | undefined;
  if (!requestId) return NextResponse.json({ ok: true }); // not a fal.ai payload

  // 1. Log FIRST — always, even if schema validation fails below.
  //    Duplicate webhooks hit the unique constraint and return early.
  const { error: logErr } = await admin.from('webhook_logs').insert({
    source: 'fal',
    event_id: requestId,
    payload: rawPayload as Record<string, unknown>,
  });

  if (logErr) {
    if (logErr.code === '23505') return NextResponse.json({ ok: true }); // duplicate
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  // 2. Validate schema — but NEVER return 4xx (fal.ai would retry forever).
  //    Log the parse error and return 200 so we can debug via webhook_logs.
  const parsed = falWebhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    await admin
      .from('webhook_logs')
      .update({ error: JSON.stringify(parsed.error.issues), processed: true })
      .eq('event_id', requestId);
    return NextResponse.json({ ok: true });
  }
  const payload = parsed.data;

  // fal.ai may nest results under 'payload' or 'output' depending on model/version
  const resultData = payload.payload ?? payload.output;

  // 3. Locate the job — prefer lookup by ?j=jobId (more secure) then fall back to fal_request_id
  const jobId = new URL(req.url).searchParams.get('j');
  const jobQuery = admin
    .from('creative_jobs')
    .select('id, campaign_id, workspace_id, type, status, credits_charged, input_params, fal_request_id');

  const { data: jobRow } = jobId
    ? await jobQuery.eq('id', jobId).single()
    : await jobQuery.eq('fal_request_id', requestId).single();

  const job = jobRow as CreativeJob | null;

  // If we looked up by jobId, verify the stored fal_request_id matches the payload — prevents spoofing
  if (jobId && job && job.fal_request_id !== requestId) {
    await admin.from('webhook_logs').update({ error: 'request_id mismatch', processed: true }).eq('event_id', requestId);
    return NextResponse.json({ ok: true });
  }

  if (!job) {
    await admin.from('webhook_logs').update({ error: 'Unknown job', processed: true }).eq('event_id', requestId);
    return NextResponse.json({ ok: true });
  }

  // If the job was cancelled server-side, acknowledge and ignore
  if (job.status === 'cancelled') {
    await admin.from('webhook_logs').update({ processed: true }).eq('event_id', requestId);
    return NextResponse.json({ ok: true });
  }

  if (isSuccessStatus(payload.status) && resultData) {
    await handleSuccess(job, resultData as Parameters<typeof handleSuccess>[1]);
  } else {
    const errMsg = typeof payload.error === 'string' ? payload.error : 'fal.ai job failed';
    await handleFailure(job, errMsg, resultData);
  }

  // 4. Mark processed
  await admin.from('webhook_logs').update({ processed: true }).eq('event_id', requestId);

  return NextResponse.json({ ok: true });
}

type ResultData = { images?: Array<{ url: string; width?: number; height?: number; content_type?: string }>; video?: { url: string; content_type?: string }; audio_file?: { url: string; content_type?: string } };

async function handleSuccess(
  job: CreativeJob,
  payload: ResultData,
) {
  const admin = createSupabaseAdminClient();
  const assetInserts: Record<string, unknown>[] = [];

  if (payload.images) {
    for (const img of payload.images) {
      const assetId = uuidv4();
      const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.jpg`;

      const imgRes = await fetch(img.url);
      const buffer = await imgRes.arrayBuffer();
      await admin.storage
        .from('assets')
        .upload(storagePath, buffer, { contentType: img.content_type ?? 'image/jpeg' });

      const { data: urlData } = admin.storage.from('assets').getPublicUrl(storagePath);

      assetInserts.push({
        id: assetId,
        campaign_id: job.campaign_id,
        workspace_id: job.workspace_id,
        job_id: job.id,
        type: 'image',
        url: urlData.publicUrl,
        storage_path: storagePath,
        width_px: img.width,
        height_px: img.height,
      });
    }
  }

  if (payload.video) {
    // Store fal.ai CDN URL directly — downloading 20-100MB in serverless is unreliable
    // fal.ai CDN URLs (v3.fal.media) are permanent and publicly accessible
    assetInserts.push({
      id: uuidv4(),
      campaign_id: job.campaign_id,
      workspace_id: job.workspace_id,
      job_id: job.id,
      type: 'video',
      url: payload.video.url,
      storage_path: null,
    });
  }

  if (payload.audio_file) {
    // Store fal.ai CDN URL directly — same rationale as video
    assetInserts.push({
      id: uuidv4(),
      campaign_id: job.campaign_id,
      workspace_id: job.workspace_id,
      job_id: job.id,
      type: 'audio',
      url: payload.audio_file.url,
      storage_path: null,
    });
  }

  if (assetInserts.length > 0) {
    await admin.from('assets').insert(assetInserts);
  }

  await admin
    .from('creative_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', job.id);

  // Propagate completion back to the campaign row so the lobby shows correct status
  await admin
    .from('campaigns')
    .update({ status: 'ready' })
    .eq('id', job.campaign_id)
    .in('status', ['generating', 'expanding']); // only advance, never revert

  await recordJobCost(job.id, job.type);
}

async function handleFailure(
  job: CreativeJob,
  errorMessage: string,
  rawErrorPayload: unknown,
) {
  const admin = createSupabaseAdminClient();

  const prompt = (job.input_params?.prompt as string) ?? '';

  // Fire-and-forget Claude analysis — refund happens regardless of analysis success
  const analysisPromise = analyzeJobFailure({
    jobType: job.type,
    prompt,
    errorMessage,
    rawError: rawErrorPayload,
  }).catch(() => null);

  // Refund credits immediately — don't wait on Claude
  await admin
    .from('creative_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      fal_raw_error: rawErrorPayload as Record<string, unknown>,
    })
    .eq('id', job.id);

  await refundCredits(job.id);

  // If the image generation itself failed, the campaign has no assets — mark it failed
  if (job.type === 'image_generation') {
    await admin
      .from('campaigns')
      .update({ status: 'failed' })
      .eq('id', job.campaign_id);
  }

  // Store analysis once Claude responds (doesn't block the webhook response)
  analysisPromise.then(async (analysis) => {
    if (!analysis) return;
    await admin
      .from('creative_jobs')
      .update({
        error_analysis: analysis.explanation,
        suggested_prompt: analysis.suggestedPrompt,
      })
      .eq('id', job.id);
  });
}
