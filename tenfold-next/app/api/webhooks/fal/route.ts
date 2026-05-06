import { NextResponse } from 'next/server';
import { db } from '@/db';
import { webhookLogs, creativeJobs, assets, campaigns } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { falWebhookPayloadSchema } from '@/lib/fal/webhooks';
import { refundCredits } from '@/lib/credits/refund';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { recordJobCost } from '@/lib/costs/tracker';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  const rawPayload: unknown = await req.json();

  const parsed = falWebhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const payload = parsed.data;

  // 1. Log first for idempotency — duplicate webhooks do nothing
  const logged = await db
    .insert(webhookLogs)
    .values({
      source: 'fal',
      eventId: payload.request_id,
      payload: rawPayload as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning();

  if (logged.length === 0) return NextResponse.json({ ok: true });

  // 2. Locate the job
  const job = await db.query.creativeJobs.findFirst({
    where: eq(creativeJobs.falRequestId, payload.request_id),
  });

  if (!job) {
    await db
      .update(webhookLogs)
      .set({ error: 'Unknown job', processed: true })
      .where(eq(webhookLogs.eventId, payload.request_id));
    return NextResponse.json({ error: 'Unknown job' }, { status: 404 });
  }

  if (payload.status === 'OK' && payload.payload) {
    await handleSuccess(job, payload.payload);
  } else {
    await handleFailure(job, payload.error ?? 'fal.ai job failed');
  }

  // 4. Mark processed
  await db
    .update(webhookLogs)
    .set({ processed: true })
    .where(eq(webhookLogs.eventId, payload.request_id));

  return NextResponse.json({ ok: true });
}

async function handleSuccess(
  job: typeof creativeJobs.$inferSelect,
  payload: NonNullable<ReturnType<typeof falWebhookPayloadSchema.parse>['payload']>,
) {
  const supabase = createSupabaseAdminClient();
  const assetRows: (typeof assets.$inferInsert)[] = [];

  if (payload.images) {
    for (const img of payload.images) {
      const assetId = uuidv4();
      const storagePath = `${job.workspaceId}/${job.campaignId}/${assetId}.jpg`;

      const imgRes = await fetch(img.url);
      const buffer = await imgRes.arrayBuffer();
      await supabase.storage
        .from('assets')
        .upload(storagePath, buffer, { contentType: img.content_type ?? 'image/jpeg' });

      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(storagePath);

      assetRows.push({
        id: assetId,
        campaignId: job.campaignId,
        workspaceId: job.workspaceId,
        jobId: job.id,
        type: 'image',
        url: urlData.publicUrl,
        storagePath,
        widthPx: img.width,
        heightPx: img.height,
      });
    }
  }

  if (payload.video) {
    const assetId = uuidv4();
    const ext = payload.video.content_type === 'video/mp4' ? 'mp4' : 'mp4';
    const storagePath = `${job.workspaceId}/${job.campaignId}/${assetId}.${ext}`;

    const vidRes = await fetch(payload.video.url);
    const buffer = await vidRes.arrayBuffer();
    await supabase.storage
      .from('assets')
      .upload(storagePath, buffer, { contentType: payload.video.content_type ?? 'video/mp4' });

    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(storagePath);

    assetRows.push({
      id: assetId,
      campaignId: job.campaignId,
      workspaceId: job.workspaceId,
      jobId: job.id,
      type: 'video',
      url: urlData.publicUrl,
      storagePath,
    });
  }

  if (payload.audio_file) {
    const assetId = uuidv4();
    const storagePath = `${job.workspaceId}/${job.campaignId}/${assetId}.mp3`;

    const audRes = await fetch(payload.audio_file.url);
    const buffer = await audRes.arrayBuffer();
    await supabase.storage
      .from('assets')
      .upload(storagePath, buffer, { contentType: payload.audio_file.content_type ?? 'audio/mpeg' });

    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(storagePath);

    assetRows.push({
      id: assetId,
      campaignId: job.campaignId,
      workspaceId: job.workspaceId,
      jobId: job.id,
      type: 'audio',
      url: urlData.publicUrl,
      storagePath,
    });
  }

  if (assetRows.length > 0) {
    await db.insert(assets).values(assetRows);
  }

  await db
    .update(creativeJobs)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(creativeJobs.id, job.id));

  // Flip campaign to 'ready' once the image generation job completes
  if (job.type === 'image_generation') {
    await db
      .update(campaigns)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(campaigns.id, job.campaignId));
  }

  await recordJobCost(job.id, job.type);
}

async function handleFailure(job: typeof creativeJobs.$inferSelect, errorMessage: string) {
  await db
    .update(creativeJobs)
    .set({ status: 'failed', errorMessage, updatedAt: new Date() })
    .where(eq(creativeJobs.id, job.id));

  await refundCredits(job.id);
}
