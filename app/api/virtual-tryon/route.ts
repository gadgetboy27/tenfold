import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { enqueueWithFallback } from "@/lib/fal/queue";
import { TRYON_MODEL, tryonInput } from "@/lib/fal/tryon";
import { v4 as uuidv4 } from "uuid";

const schema = z.object({
  campaignId: z.string().uuid(),
  modelImageUrl: z.string().url(),
  garmentImageUrl: z.string().url(),
  category: z.enum(["auto", "tops", "bottoms", "one-pieces"]).default("auto"),
});

// POST /api/virtual-tryon — put a garment onto a model photo (FASHN v1.6).
// Dedicated submit route, but the result is a single image so it reuses the
// existing /api/webhooks/fal handler for storage + completion.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = schema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const ent = await getEntitlements(session.workspaceId);
    if (!ent.isPro) {
      return NextResponse.json(
        {
          error: "Virtual try-on is a Pro feature — upgrade to use it.",
          upgrade: true,
        },
        { status: 403 },
      );
    }

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.virtual_tryon;
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "virtual_tryon",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: body.campaignId,
      workspace_id: session.workspaceId,
      type: "virtual_tryon",
      status: "queued",
      input_params: {
        modelImageUrl: body.modelImageUrl,
        garmentImageUrl: body.garmentImageUrl,
        category: body.category,
      },
      credits_charged: cost,
    });

    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    try {
      const { requestId } = await enqueueWithFallback(
        [TRYON_MODEL],
        tryonInput({
          modelImageUrl: body.modelImageUrl,
          garmentImageUrl: body.garmentImageUrl,
          category: body.category,
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
