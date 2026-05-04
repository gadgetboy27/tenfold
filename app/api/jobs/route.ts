import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { creativeJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createJobSchema } from '@/lib/validation/schemas';
import { debitCredits } from '@/lib/credits/debit';
import { CREDIT_COSTS, type CreditCostKey } from '@/lib/credits/costs';
import { enqueueJob } from '@/lib/fal/queue';
import { v4 as uuidv4 } from 'uuid';

// Image generation input shape for fal.ai
function buildFalInput(type: string, params: Record<string, unknown>, prompt: string) {
  if (type === 'image_generation') {
    return {
      prompt,
      image_size: (params.imageSize as string) ?? 'square_hd',
      num_images: 6,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      enable_safety_checker: true,
      seed: params.seed as number | undefined,
    };
  }
  return params;
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createJobSchema.parse(await req.json());

    if (!(body.type in CREDIT_COSTS)) {
      return NextResponse.json({ error: 'Unknown job type' }, { status: 400 });
    }

    const jobId = uuidv4();
    const creditType = body.type as CreditCostKey;
    const cost = CREDIT_COSTS[creditType];

    // 1. Debit credits atomically — fail fast if insufficient
    const debit = await debitCredits(session.workspaceId, jobId, creditType);
    if (!debit.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // 2. Create job row
    const prompt = (body.params.prompt as string) ?? '';
    await db.insert(creativeJobs).values({
      id: jobId,
      campaignId: body.campaignId,
      workspaceId: session.workspaceId,
      type: body.type,
      status: 'queued',
      inputParams: body.params,
      creditsCharged: cost,
    });

    // 3. Enqueue to fal.ai — non-blocking
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal`;
    const falInput = buildFalInput(body.type, body.params, prompt);
    const { requestId } = await enqueueJob(
      body.type as import('@/lib/fal/models').FalModelKey,
      falInput,
      webhookUrl,
    );

    // 4. Store fal request_id
    await db
      .update(creativeJobs)
      .set({ falRequestId: requestId, status: 'processing', updatedAt: new Date() })
      .where(eq(creativeJobs.id, jobId));

    return NextResponse.json({ jobId, requestId }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
