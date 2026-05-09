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

  // Claim the job atomically — skip if another request already completed it
  const { data: claimed } = await admin
    .from('creative_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'processing')
    .select('id')
    .single();

  if (!claimed) return true; // already handled

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
      // Store fal.ai CDN URL directly — permanent, no download needed in serverless
      assetInserts.push({
        id: uuidv4(),
        campaign_id: job.campaign_id,
        workspace_id: job.workspace_id,
        job_id: job.id,
        type: 'video',
        url: result.data.video.url,
        storage_path: null,
      });
    }

    if (result.data?.audio_file) {
      // Store fal.ai CDN URL directly — permanent, no download needed in serverless
      assetInserts.push({
        id: uuidv4(),
        campaign_id: job.campaign_id,
        workspace_id: job.workspace_id,
        job_id: job.id,
        type: 'audio',
        url: result.data.audio_file.url,
        storage_path: null,
      });
    }

    if (assetInserts.length > 0) {
      await admin.from('assets').insert(assetInserts);
    }
  } catch {
    // If result fetch/storage fails, revert job status so it can be retried
    await admin
      .from('creative_jobs')
      .update({ status: 'processing', completed_at: null })
      .eq('id', job.id);
    return false;
  }

  return true;
}
