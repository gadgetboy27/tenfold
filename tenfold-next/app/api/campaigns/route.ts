import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { campaigns, creativeJobs } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createCampaignSchema } from '@/lib/validation/schemas';
import { v4 as uuidv4 } from 'uuid';
import { debitCredits } from '@/lib/credits/debit';
import { enqueueJob } from '@/lib/fal/queue';

function aspectRatioToFalSize(ratio: string): string {
  switch (ratio) {
    case '1:1':  return 'square_hd';
    case '4:5':  return 'portrait_4_3';
    case '16:9': return 'landscape_16_9';
    case '9:16': return 'portrait_16_9';
    default:     return 'square_hd';
  }
}

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
    const aspectRatio = body.aspectRatio;
    const style = body.style;

    // 1. Create campaign record
    await db.insert(campaigns).values({
      id: campaignId,
      workspaceId: session.workspaceId,
      createdBy: session.userId,
      prompt: body.prompt,
      parameters: { aspectRatio, style, ...body.parameters },
      status: 'generating',
    });

    // 2. Debit credits (18 cr for image generation)
    const debit = await debitCredits(session.workspaceId, jobId, 'image_generation');
    if (!debit.success) {
      await db.delete(campaigns).where(eq(campaigns.id, campaignId));
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // 3. Build fal.ai input — request 6 images in one shot
    const falInput = {
      prompt: body.prompt,
      image_size: aspectRatioToFalSize(aspectRatio),
      num_images: 6,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      enable_safety_checker: true,
    };

    // 4. Enqueue with fal.ai async queue
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal`;
    const { requestId } = await enqueueJob('image_generation', falInput, webhookUrl);

    // 5. Persist the job record so the webhook can look it up
    await db.insert(creativeJobs).values({
      id: jobId,
      campaignId,
      workspaceId: session.workspaceId,
      type: 'image_generation',
      status: 'processing',
      falRequestId: requestId,
      inputParams: falInput as Record<string, unknown>,
      creditsCharged: 18,
    });

    return NextResponse.json({ id: campaignId, campaignId, status: 'generating' }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
