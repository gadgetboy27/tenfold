import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createJobSchema } from '@/lib/validation/schemas';
import { debitCredits } from '@/lib/credits/debit';
import { refundCredits } from '@/lib/credits/refund';
import { CREDIT_COSTS, type CreditCostKey } from '@/lib/credits/costs';
import { enqueueJob } from '@/lib/fal/queue';
import { generateScript } from '@/lib/claude/script';
import { v4 as uuidv4 } from 'uuid';

const STYLE_SUFFIXES: Record<string, string> = {
  Photorealistic: 'photorealistic, ultra-detailed, sharp focus, professional photography',
  Illustration:   'digital illustration, artistic, stylized, vibrant colors',
  Cinematic:      'cinematic, film grain, dramatic lighting, anamorphic lens, widescreen',
  '3D':           '3D render, CGI, volumetric lighting, octane render, subsurface scattering',
};

function buildFalInput(type: string, params: Record<string, unknown>, prompt: string) {
  if (type === 'image_generation') {
    const styleSuffix = STYLE_SUFFIXES[params.style as string] ?? '';
    const fullPrompt = styleSuffix ? `${prompt}, ${styleSuffix}` : prompt;
    return {
      prompt: fullPrompt,
      image_size: (params.imageSize as string) ?? 'square_hd',
      num_images: 1,
      seed: params.seed as number | undefined,
    };
  }
  if (type === 'video_10s' || type === 'video_30s' || type === 'video_60s') {
    const durationMap: Record<string, '5' | '10'> = { video_10s: '5', video_30s: '10', video_60s: '10' };
    return {
      image_url: params.imageUrl as string,
      prompt: prompt || (params.prompt as string) || '',
      duration: durationMap[type],
      aspect_ratio: '16:9',
    };
  }
  if (type === 'music_generation') {
    return {
      prompt: prompt || (params.mood as string) || 'uplifting background music',
      seconds_total: 30,
      steps: 100,
    };
  }
  return params;
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createJobSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    if (!(body.type in CREDIT_COSTS)) {
      return NextResponse.json({ error: 'Unknown job type' }, { status: 400 });
    }

    const jobId = uuidv4();
    const creditType = body.type as CreditCostKey;
    const cost = CREDIT_COSTS[creditType];

    const debit = await debitCredits(session.workspaceId, jobId, creditType);
    if (!debit.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const prompt = (body.params.prompt as string) ?? '';

    const { error: jobErr } = await admin.from('creative_jobs').insert({
      id: jobId,
      campaign_id: body.campaignId,
      workspace_id: session.workspaceId,
      type: body.type,
      status: 'queued',
      input_params: body.params,
      credits_charged: cost,
    });
    if (jobErr) throw new Error(jobErr.message);

    // Script generation is synchronous
    if (body.type === 'script_generation') {
      try {
        const result = await generateScript({
          imageDescription: (body.params.imageDescription as string) ?? '',
          businessName: (body.params.businessName as string) ?? '',
          platform: (body.params.platform as string) ?? 'instagram',
          tone: (body.params.tone as 'professional' | 'casual' | 'playful') ?? 'professional',
          maxWords: (body.params.maxWords as number) ?? 50,
        });

        await admin
          .from('creative_jobs')
          .update({ status: 'completed', actual_cost_usd: result.actualCostUsd })
          .eq('id', jobId);

        return NextResponse.json({ jobId, creditCost: cost, status: 'ready', result: result.text }, { status: 201 });
      } catch (scriptErr) {
        const msg = scriptErr instanceof Error ? scriptErr.message : 'Caption generation failed';
        await admin
          .from('creative_jobs')
          .update({ status: 'failed', error_message: msg })
          .eq('id', jobId);
        await refundCredits(jobId);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    // All other types go through fal.ai async queue
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    const falInput = buildFalInput(body.type, body.params, prompt);
    const { requestId } = await enqueueJob(
      body.type as import('@/lib/fal/models').FalModelKey,
      falInput,
      webhookUrl,
    );

    await admin
      .from('creative_jobs')
      .update({ fal_request_id: requestId, status: 'processing' })
      .eq('id', jobId);

    return NextResponse.json({ jobId, requestId, creditCost: cost, status: 'processing' }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
