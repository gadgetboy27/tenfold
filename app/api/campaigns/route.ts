import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { campaigns, creativeJobs } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createCampaignSchema } from '@/lib/validation/schemas';
import { debitCredits } from '@/lib/credits/debit';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { enqueueJob } from '@/lib/fal/queue';
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
    const list = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.workspaceId, session.workspaceId))
      .orderBy(desc(campaigns.createdAt))
      .limit(50);
    return NextResponse.json(list);
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
    await db.insert(campaigns).values({
      id: campaignId,
      workspaceId: session.workspaceId,
      createdBy: session.userId,
      prompt: body.prompt,
      parameters: { aspectRatio: body.aspectRatio, style: body.style },
      status: 'generating',
    });

    // 3. Create job row
    await db.insert(creativeJobs).values({
      id: jobId,
      campaignId,
      workspaceId: session.workspaceId,
      type: 'image_generation',
      status: 'queued',
      inputParams: { prompt: fullPrompt, imageSize, style: body.style },
      creditsCharged: cost,
    });

    // 4. Enqueue to fal.ai
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal`;
    const { requestId } = await enqueueJob('image_generation', {
      prompt: fullPrompt,
      image_size: imageSize,
      num_images: 6,
      num_inference_steps: 28,
      guidance_scale: 5,
      enable_safety_checker: true,
    }, webhookUrl);

    // 5. Update job with fal request ID
    await db
      .update(creativeJobs)
      .set({ falRequestId: requestId, status: 'processing', updatedAt: new Date() })
      .where(eq(creativeJobs.id, jobId));

    return NextResponse.json({ campaignId, status: 'generating' }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Insufficient credits' ? 402 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
