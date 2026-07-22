import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS, type CreditCostKey } from "@/lib/credits/costs";
import { enqueueJob } from "@/lib/fal/queue";
import type { FalModelKey } from "@/lib/fal/models";
import {
  COMPOSITE_JOB_TYPE,
  buildCompositeInput,
  isValidBlendCount,
  type CompositeParams,
} from "@/lib/compositing/ops";

// POST /api/compositing — AI compositing ops (cutout, inpaint, relight, blend,
// depth). Same async pattern as bg-remove/upscale: debit → creative_job → fal
// queue → webhook saves the result as a composite_step asset. Mechanical (Sharp)
// blends are NOT here — see POST /api/compositing/blend (synchronous, 0 credits).
const bodySchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("cutout"),
    campaignId: z.string().uuid(),
    params: z.object({ imageUrl: z.string().url() }),
  }),
  z.object({
    op: z.literal("inpaint"),
    campaignId: z.string().uuid(),
    params: z.object({
      imageUrl: z.string().url(),
      maskUrl: z.string().url(),
      prompt: z.string().min(1).max(2000),
    }),
  }),
  z.object({
    op: z.literal("relight"),
    campaignId: z.string().uuid(),
    params: z.object({
      imageUrl: z.string().url(),
      prompt: z.string().min(1).max(2000),
      direction: z.enum(["None", "Left", "Right", "Top", "Bottom"]).optional(),
    }),
  }),
  z.object({
    op: z.literal("blend"),
    campaignId: z.string().uuid(),
    params: z.object({
      imageUrls: z.array(z.string().url()).min(2).max(5),
      prompt: z.string().min(1).max(2000),
    }),
  }),
  z.object({
    op: z.literal("depth"),
    campaignId: z.string().uuid(),
    params: z.object({ imageUrl: z.string().url() }),
  }),
]);

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const body = bodySchema.parse(await req.json());

  if (body.op === "blend" && !isValidBlendCount(body.params.imageUrls.length)) {
    return NextResponse.json(
      { error: "Blend needs between 2 and 5 images" },
      { status: 400 },
    );
  }

  // Tenant guard — the campaign must belong to this workspace.
  const { data: campaign } = await db
    .from("campaigns")
    .select("id")
    .eq("id", body.campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const jobId = uuidv4();
  const jobType = COMPOSITE_JOB_TYPE[body.op];
  const creditKey = jobType as CreditCostKey;
  const cost = CREDIT_COSTS[creditKey];

  const debit = await debitCredits(session.workspaceId, jobId, creditKey);
  if (!debit.success) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const { error: jobErr } = await admin.from("creative_jobs").insert({
    id: jobId,
    campaign_id: body.campaignId,
    workspace_id: session.workspaceId,
    type: jobType,
    status: "queued",
    credits_charged: cost,
    input_params: { op: body.op, ...body.params },
  });
  if (jobErr) {
    await refundCredits(jobId);
    throw new Error(jobErr.message);
  }

  const falInput = buildCompositeInput(body as CompositeParams);
  const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
  try {
    const { requestId } = await enqueueJob(
      jobType as FalModelKey,
      falInput,
      webhookUrl,
    );
    await admin
      .from("creative_jobs")
      .update({ fal_request_id: requestId, status: "processing" })
      .eq("id", jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Submission failed";
    await admin
      .from("creative_jobs")
      .update({ status: "failed", error_message: msg })
      .eq("id", jobId);
    await refundCredits(jobId);
    return NextResponse.json(
      { error: `Could not start ${body.op}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ jobId, creditCost: cost }, { status: 201 });
});
