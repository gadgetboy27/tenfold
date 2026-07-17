import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { enqueueWithFallback } from "@/lib/fal/queue";
import { PRODUCT_SHOT_MODEL, productShotInput } from "@/lib/fal/product-shot";
import { v4 as uuidv4 } from "uuid";

const schema = z.object({
  campaignId: z.string().uuid(),
  productImageUrl: z.string().url(),
  scene: z.string().min(3).max(600),
  placement: z
    .enum(["bottom_center", "center_vertical", "upper_left"])
    .default("bottom_center"),
});

// POST /api/product-shot — place a product into a generated lifestyle scene
// (Bria Product Shot). Single image job, so it reuses /api/webhooks/fal.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = schema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const ent = await getEntitlements(session.workspaceId);
    if (!ent.isPro) {
      return NextResponse.json(
        {
          error: "Product scenes are a Pro feature — upgrade to use them.",
          upgrade: true,
        },
        { status: 403 },
      );
    }

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.product_shot;
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "product_shot",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    // Checked, and refunded on failure. supabase-js returns { error } rather
    // than throwing, so an unchecked insert fails SILENTLY: the debit stands,
    // fal still gets called, and the webhook then has no job row to write the
    // result to — the customer pays and receives nothing, with no error raised
    // anywhere. Nothing downstream can refund it either, because refundCredits
    // keys off the job that was never created.
    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: body.campaignId,
      workspace_id: session.workspaceId,
      type: "product_shot",
      status: "queued",
      input_params: {
        productImageUrl: body.productImageUrl,
        scene: body.scene,
        placement: body.placement,
      },
      credits_charged: cost,
    });
    if (jobErr) {
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start the job — you have not been charged." },
        { status: 500 },
      );
    }

    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    try {
      const { requestId } = await enqueueWithFallback(
        [PRODUCT_SHOT_MODEL],
        productShotInput({
          productImageUrl: body.productImageUrl,
          scene: body.scene,
          placement: body.placement,
        }),
        webhookUrl,
      );
      await admin
        .from("creative_jobs")
        .update({ fal_request_id: requestId, status: "processing" })
        .eq("id", jobId);
      return NextResponse.json(
        { jobId, requestId, creditCost: cost, status: "processing" },
        { status: 201 },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submit failed";
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
