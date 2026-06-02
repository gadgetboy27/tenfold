import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createJobSchema } from '@/lib/validation/schemas';
import { debitCredits } from '@/lib/credits/debit';
import { refundCredits } from '@/lib/credits/refund';
import { CREDIT_COSTS, type CreditCostKey } from '@/lib/credits/costs';
import { enqueueJob } from '@/lib/fal/queue';
import { generateScript } from '@/lib/claude/script';
import {
  IMAGE_STYLE_SUFFIXES,
  MUSIC_GENRE_PROMPTS,
  VIDEO_DURATION_PROMPTS,
  VIDEO_STYLE_PROMPTS,
  type VideoStyle,
} from '@/lib/fal/prompts';
import { v4 as uuidv4 } from 'uuid';

function buildFalInput(type: string, params: Record<string, unknown>, prompt: string) {
  if (type === 'image_generation') {
    const styleSuffix = IMAGE_STYLE_SUFFIXES[params.style as string] ?? '';
    const fullPrompt = styleSuffix ? `${prompt}, ${styleSuffix}` : prompt;
    return {
      prompt: fullPrompt,
      image_size: (params.imageSize as string) ?? 'square_hd',
      num_images: 1,
      seed: params.seed as number | undefined,
    };
  }
  if (type === 'video_10s' || type === 'video_30s' || type === 'video_60s') {
    const durationMap: Record<string, number> = { video_10s: 5, video_30s: 10, video_60s: 10 };
    const style = (params.videoStyle as VideoStyle) ?? 'Cinematic';
    const durationBrief = VIDEO_DURATION_PROMPTS[type];
    const styleBrief = VIDEO_STYLE_PROMPTS[style].prompt;
    const variationDir = (params.variationDirection as string) ?? '';
    const composedParts = [durationBrief, styleBrief, prompt, variationDir ? `with ${variationDir}` : '']
      .filter(Boolean);
    const composedPrompt = composedParts.join(', ');
    return {
      image_url: params.imageUrl as string,
      prompt: composedPrompt,
      duration: durationMap[type],
      negative_prompt: VIDEO_STYLE_PROMPTS[style].negativePrompt,
    };
  }
  if (type === 'music_generation') {
    const genre = (params.genre as string) ?? 'Lo-fi Chill';
    const genrePrompt = MUSIC_GENRE_PROMPTS[genre] ?? MUSIC_GENRE_PROMPTS['Lo-fi Chill'];
    const variationDir = (params.variationDirection as string) ?? '';
    const finalPrompt = variationDir ? `${genrePrompt}, but ${variationDir}` : genrePrompt;
    return {
      prompt: finalPrompt,
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
          variationDirection: (body.params.variationDirection as string) ?? '',
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
