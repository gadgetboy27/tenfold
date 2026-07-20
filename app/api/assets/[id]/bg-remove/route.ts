import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getEntitlements } from "@/lib/billing/entitlements";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { enqueueJob } from "@/lib/fal/queue";

// POST /api/assets/:id/bg-remove — Pro effect. Removes the background of an image
// (fal BiRefNet v2 → transparent PNG). Same async pattern as upscale: gate → debit
// → creative_job → fal queue → webhook saves the cutout as a new asset.
export const POST = withWorkspace<{ id: string }>(
  async (_req, { db, admin, session, params }) => {
    const ent = await getEntitlements(session.workspaceId);
    if (!ent.isPro) {
      return NextResponse.json(
        {
          error: "Background removal is a Pro effect — upgrade to unlock.",
          upgrade: true,
        },
        { status: 403 },
      );
    }

    const { data: asset } = await db
      .from("assets")
      .select("id, campaign_id, url, type")
      .eq("id", params.id)
      .single();
    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    const a = asset as { campaign_id: string; url: string; type: string };
    if (a.type !== "image") {
      return NextResponse.json(
        { error: "Only images can have their background removed" },
        { status: 400 },
      );
    }

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.bg_remove;

    const debit = await debitCredits(session.workspaceId, jobId, "bg_remove");
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: a.campaign_id,
      workspace_id: session.workspaceId,
      type: "bg_remove",
      status: "queued",
      credits_charged: cost,
      input_params: { source_asset_id: params.id, image_url: a.url },
    });
    if (jobErr) {
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    try {
      const { requestId } = await enqueueJob(
        "bg_remove",
        { image_url: a.url, output_format: "png", refine_foreground: true },
        webhookUrl,
      );
      await admin
        .from("creative_jobs")
        .update({ fal_request_id: requestId, status: "processing" })
        .eq("id", jobId);
    } catch {
      await admin
        .from("creative_jobs")
        .update({
          status: "failed",
          error_message: "Background removal submission failed",
        })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start background removal" },
        { status: 500 },
      );
    }

    return NextResponse.json({ jobId, creditCost: cost }, { status: 201 });
  },
);
