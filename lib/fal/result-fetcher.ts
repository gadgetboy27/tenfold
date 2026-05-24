import { fal } from './client';
import { FAL_MODELS, FAL_QUEUE_MODELS, type FalModelKey } from './models';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { v4 as uuidv4 } from 'uuid';


interface StuckJob {
  id: string;
  campaign_id: string;
  workspace_id: string;
  type: string;
  fal_request_id: string;
}

interface FalResult {
  data: {
    images?:     Array<{ url: string; width?: number; height?: number; content_type?: string }>;
    video?:      { url: string; content_type?: string };
    audio_file?: { url: string; content_type?: string };
  };
  requestId: string;
}

export async function fetchAndProcessFalJob(job: StuckJob): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const jobType = job.type as FalModelKey;
  // Use queue alias (base path) for status/result — versioned submit paths differ from queue paths
  const modelId = FAL_QUEUE_MODELS[jobType] ?? FAL_MODELS[jobType] ?? job.type;

  try {
    const status = await fal.queue.status(modelId, { requestId: job.fal_request_id });
    if ((status.status as string) === 'FAILED') {
      await admin
        .from('creative_jobs')
        .update({ status: 'failed', error_message: 'Generation failed on fal.ai — the model was unable to process your request' })
        .eq('id', job.id)
        .eq('status', 'processing');
      return true;
    }
    if (status.status !== 'COMPLETED') return false;
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

    if (result.data?.video) {
      const assetId = uuidv4();
      const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.mp4`;
      let publicUrl = result.data.video.url;
      let storedPath: string | null = null;
      try {
        const videoRes = await fetch(result.data.video.url, { signal: AbortSignal.timeout(90_000) });
        const buffer = await videoRes.arrayBuffer();
        const { error: upErr } = await admin.storage
          .from('assets')
          .upload(storagePath, buffer, { contentType: result.data.video.content_type ?? 'video/mp4' });
        if (!upErr) {
          const { data: urlData } = admin.storage.from('assets').getPublicUrl(storagePath);
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
        type: 'video',
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
        const audioRes = await fetch(result.data.audio_file.url, { signal: AbortSignal.timeout(60_000) });
        const buffer = await audioRes.arrayBuffer();
        const { error: upErr } = await admin.storage
          .from('assets')
          .upload(storagePath, buffer, { contentType: result.data.audio_file.content_type ?? 'audio/mpeg' });
        if (!upErr) {
          const { data: urlData } = admin.storage.from('assets').getPublicUrl(storagePath);
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
        type: 'audio',
        url: publicUrl,
        storage_path: storedPath,
      });
    }

    // Insert assets FIRST, then atomically claim the job as completed.
    // This eliminates the race window where a concurrent poll sees completed+no-assets.
    if (assetInserts.length > 0) {
      await admin.from('assets').insert(assetInserts);
    }

    // If the webhook already processed this job, assets may be duplicated — that's acceptable.
    await admin
      .from('creative_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'processing');
  } catch {
    // Revert job status so polling can retry
    await admin
      .from('creative_jobs')
      .update({ status: 'processing', completed_at: null })
      .eq('id', job.id);
    return false;
  }

  return true;
}
