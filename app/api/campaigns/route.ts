import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createCampaignSchema } from '@/lib/validation/schemas';
import { debitCredits } from '@/lib/credits/debit';
import { refundCredits } from '@/lib/credits/refund';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { enqueueJob } from '@/lib/fal/queue';
import { validatePrompt } from '@/lib/fal/prompt-validator';
import { v4 as uuidv4 } from 'uuid';

const ASPECT_TO_IMAGE_SIZE: Record<string, string> = {
  '1:1':  'square_hd',
  '4:5':  'portrait_4_3',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
};

const STYLE_SUFFIXES: Record<string, string> = {
  Photorealistic: 'photorealistic, ultra-detailed, sharp focus, professional photography',
  Illustration:   'digital illustration, artistic, stylized, vibrant colors',
  Cinematic:      'cinematic, film grain, dramatic lighting, anamorphic lens, widescreen',
  '3D':           '3D render, CGI, volumetric lighting, octane render, subsurface scattering',
};

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();
    const { data: campaigns, error } = await admin
      .from('campaigns')
      .select('*')
      .eq('workspace_id', session.workspaceId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    if (!campaigns?.length) return NextResponse.json([]);

    // Fetch first image asset per campaign for thumbnails
    const ids = campaigns.map(c => c.id as string);
    const { data: thumbAssets } = await admin
      .from('assets')
      .select('id, url, campaign_id')
      .in('campaign_id', ids)
      .eq('type', 'image')
      .order('created_at', { ascending: true });

    const thumbMap: Record<string, string> = {};
    for (const a of thumbAssets ?? []) {
      if (!thumbMap[a.campaign_id as string]) thumbMap[a.campaign_id as string] = a.url as string;
    }
    // Prefer anchor asset URL when available
    const anchorIds = campaigns.map(c => c.anchor_asset_id).filter(Boolean) as string[];
    if (anchorIds.length) {
      const { data: anchorAssets } = await admin
        .from('assets').select('id, url').in('id', anchorIds);
      for (const c of campaigns) {
        if (c.anchor_asset_id) {
          const a = anchorAssets?.find(x => x.id === c.anchor_asset_id);
          if (a) thumbMap[c.id as string] = a.url as string;
        }
      }
    }

    // Auto-recover campaigns still stuck in 'generating' (webhook may have been missed)
    const stale = campaigns.filter(c => c.status === 'generating');
    if (stale.length > 0) {
      const staleIds = stale.map(c => c.id as string);
      const { data: jobRows } = await admin
        .from('creative_jobs')
        .select('campaign_id, status')
        .in('campaign_id', staleIds);

      const jobsByCampaign = new Map<string, string[]>();
      for (const j of jobRows ?? []) {
        const arr = jobsByCampaign.get(j.campaign_id as string) ?? [];
        arr.push(j.status as string);
        jobsByCampaign.set(j.campaign_id as string, arr);
      }

      const toReady: string[] = [];
      const toFailed: string[] = [];
      for (const c of stale) {
        const statuses = jobsByCampaign.get(c.id as string) ?? [];
        if (statuses.length === 0) continue;
        if (statuses.every(s => s === 'completed')) toReady.push(c.id as string);
        else if (statuses.every(s => s === 'failed' || s === 'cancelled')) toFailed.push(c.id as string);
      }

      if (toReady.length) {
        await admin.from('campaigns').update({ status: 'ready' }).in('id', toReady);
        for (const c of campaigns) { if (toReady.includes(c.id as string)) c.status = 'ready'; }
      }
      if (toFailed.length) {
        await admin.from('campaigns').update({ status: 'failed' }).in('id', toFailed);
        for (const c of campaigns) { if (toFailed.includes(c.id as string)) c.status = 'failed'; }
      }
    }

    const enriched = campaigns.map(c => ({
      ...c,
      thumbnailUrl: thumbMap[c.id as string] ?? null,
      // Tell the client how old the 'generating' state is so it can show a stale indicator
      generatingSince: c.status === 'generating' ? c.created_at : null,
    }));
    return NextResponse.json(enriched);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Not a workspace member' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createCampaignSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // 0. Validate prompt quality before touching credits
    const validation = await validatePrompt(body.prompt, body.style ?? 'Photorealistic');
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Prompt rejected', issues: validation.issues, refinedPrompt: validation.refinedPrompt },
        { status: 422 },
      );
    }

    const campaignId = uuidv4();
    const jobId = uuidv4();
    const cost = CREDIT_COSTS.image_generation;

    // 1. Debit credits before anything else
    const debit = await debitCredits(session.workspaceId, jobId, 'image_generation');
    if (!debit.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const imageSize = ASPECT_TO_IMAGE_SIZE[body.aspectRatio ?? '1:1'] ?? 'square_hd';
    const styleSuffix = STYLE_SUFFIXES[body.style ?? ''] ?? '';
    const fullPrompt = styleSuffix ? `${body.prompt}, ${styleSuffix}` : body.prompt;

    // 2. Create campaign row
    const { error: campErr } = await admin.from('campaigns').insert({
      id: campaignId,
      workspace_id: session.workspaceId,
      created_by: session.userId,
      name: body.name ?? 'Untitled Campaign',
      prompt: body.prompt,
      parameters: { aspectRatio: body.aspectRatio, style: body.style },
      status: 'generating',
    });
    if (campErr) throw new Error(campErr.message);

    // 3. Create job row
    const { error: jobErr } = await admin.from('creative_jobs').insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: 'image_generation',
      status: 'queued',
      input_params: { prompt: fullPrompt, imageSize, style: body.style },
      credits_charged: cost,
    });
    if (jobErr) throw new Error(jobErr.message);

    // 4. Enqueue to fal.ai — refund credits if submission fails
    // Unique per-job URL breaks any circuit-breaker on repeated failures
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    let requestId: string;
    try {
      ({ requestId } = await enqueueJob('image_generation', {
        prompt: fullPrompt,
        image_size: imageSize,
        num_images: 4,
      }, webhookUrl));
    } catch (falErr) {
      await refundCredits(jobId);
      throw falErr;
    }

    // 5. Update job with fal request ID
    await admin
      .from('creative_jobs')
      .update({ fal_request_id: requestId, status: 'processing' })
      .eq('id', jobId);

    return NextResponse.json({ campaignId, jobId, status: 'generating' }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Insufficient credits' ? 402 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
