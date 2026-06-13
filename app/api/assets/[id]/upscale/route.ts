import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getEntitlements } from "@/lib/billing/entitlements";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { enqueueJob } from "@/lib/fal/queue";

// POST /api/assets/:id/upscale — HD / print-ready upscale (Pro feature).
// Gated to plans with hdExport; debits the upscale credit, runs the fal
// clarity-upscaler, and the resulting HD image lands as a new asset (tagged hd).
export const POST = withWorkspace<{ id: string }>(
  async (_req, { db, admin, session, params }) => {
    const ent = await getEntitlements(session.workspaceId);
    if (!ent.hdExport) {
      return NextResponse.json(
        {
          error: "HD export is a Pro feature — upgrade to unlock.",
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
        { error: "Only images can be upscaled" },
        { status: 400 },
      );
    }

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.upscale;

    const debit = await debitCredits(session.workspaceId, jobId, "upscale");
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
      type: "upscale",
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
        "upscale",
        { image_url: a.url, upscale_factor: 2 },
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
          error_message: "HD upscale submission failed",
        })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start HD upscale" },
        { status: 500 },
      );
    }

    return NextResponse.json({ jobId, creditCost: cost }, { status: 201 });
  },
);
