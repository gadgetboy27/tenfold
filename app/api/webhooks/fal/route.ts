import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { falWebhookPayloadSchema } from '@/lib/fal/webhooks';
import { refundCredits } from '@/lib/credits/refund';
import { recordJobCost } from '@/lib/costs/tracker';
import { analyzeJobFailure } from '@/lib/fal/error-analyzer';
import { v4 as uuidv4 } from 'uuid';

function resolveAudioContentType(url: string): string {
  if (url.includes('.wav')) return 'audio/wav';
  if (url.includes('.mp3')) return 'audio/mpeg';
  return 'audio/wav';
}

function audioExtension(url: string): string {
  return url.includes('.mp3') ? 'mp3' : 'wav';
}

interface CreativeJob {
  id: string;
  campaign_id: string;
  workspace_id: string;
  type: string;
  credits_charged: number;
  input_params: Record<string, unknown>;
}

export async function POST(req: Request) {
  const rawPayload: unknown = await req.json();
  const admin = createSupabaseAdminClient();

  const parsed = falWebhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const payload = parsed.data;

  // 1. Log first for idempotency — duplicate webhooks do nothing
  const { error: logErr } = await admin.from('webhook_logs').insert({
    source: 'fal',
    event_id: payload.request_id,
    payload: rawPayload as Record<string, unknown>,
  });

  if (logErr) {
    if (logErr.code === '23505') return NextResponse.json({ ok: true });
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  // 2. Locate the job (fetch input_params so the error analyzer has the original prompt)
  const { data: jobRow } = await admin
    .from('creative_jobs')
    .select('id, campaign_id, workspace_id, type, credits_charged, input_params')
    .eq('fal_request_id', payload.request_id)
    .single();

  const job = jobRow as CreativeJob | null;

  if (!job) {
    await admin
      .from('webhook_logs')
      .update({ error: 'Unknown job', processed: true })
      .eq('event_id', payload.request_id);
    return NextResponse.json({ error: 'Unknown job' }, { status: 404 });
  }

  if (payload.status === 'OK' && payload.payload) {
    await handleSuccess(job, payload.payload);
  } else {
    await handleFailure(job, payload.error ?? 'fal.ai job failed', payload.payload);
  }

  // 3. Mark processed
  await admin
    .from('webhook_logs')
    .update({ processed: true })
    .eq('event_id', payload.request_id);

  return NextResponse.json({ ok: true });
}

async function handleSuccess(
  job: CreativeJob,
  payload: NonNullable<ReturnType<typeof falWebhookPayloadSchema.parse>['payload']>,
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
    const assetId = uuidv4();
    const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.mp4`;

    const vidRes = await fetch(payload.video.url);
    const buffer = await vidRes.arrayBuffer();
    await admin.storage
      .from('assets')
      .upload(storagePath, buffer, { contentType: payload.video.content_type ?? 'video/mp4' });

    const { data: urlData } = admin.storage.from('assets').getPublicUrl(storagePath);

    assetInserts.push({
      id: assetId,
      campaign_id: job.campaign_id,
      workspace_id: job.workspace_id,
      job_id: job.id,
      type: 'video',
      url: urlData.publicUrl,
      storage_path: storagePath,
    });
  }

  if (payload.audio_file) {
    const assetId = uuidv4();
    const ext = audioExtension(payload.audio_file.url);
    const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.${ext}`;

    const audRes = await fetch(payload.audio_file.url);
    const buffer = await audRes.arrayBuffer();
    await admin.storage
      .from('assets')
      .upload(storagePath, buffer, { contentType: resolveAudioContentType(payload.audio_file.url) });

    const { data: urlData } = admin.storage.from('assets').getPublicUrl(storagePath);

    assetInserts.push({
      id: assetId,
      campaign_id: job.campaign_id,
      workspace_id: job.workspace_id,
      job_id: job.id,
      type: 'audio',
      url: urlData.publicUrl,
      storage_path: storagePath,
    });
  }

  if (assetInserts.length > 0) {
    await admin.from('assets').insert(assetInserts);
  }

  await admin
    .from('creative_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', job.id);

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
