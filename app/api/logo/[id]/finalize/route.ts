import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueJob } from "@/lib/fal/queue";
import { logoBriefSchema } from "@/lib/logo/brief";
import { composeLogoPrompt } from "@/lib/logo/promptComposer";
import { ensureLogoCampaign } from "@/app/api/logo/route";

// POST /api/logo/:id/finalize — premium SVG via Recraft V4.1 Pro text-to-vector.
//
// text-to-vector is PROMPT-driven, not image-driven, so finalize re-generates
// from the project's brief at Pro quality rather than tracing the refined
// pixels. The webhook records it as the project's final_asset_id.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const { id } = await ctx.params;
    const admin = createSupabaseAdminClient();

    const { data: project } = await admin
      .from("logo_projects")
      .select("id, brief, anchor_asset_id")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // The stored brief was validated on create; re-parse to apply defaults for
    // any field and to type it, rather than trusting the jsonb blob shape.
    const brief = logoBriefSchema.parse(
      (project as { brief: unknown }).brief ?? {},
    );

    // Finalize the LOOK the user picked: re-use the chosen concept's aesthetic
    // prompt (saved on the raster concept) so the Pro SVG matches it. Falls back
    // to the base brief prompt if no concept was anchored (older projects).
    const anchorId = (project as { anchor_asset_id: string | null })
      .anchor_asset_id;
    let anchorPrompt: string | null = null;
    if (anchorId) {
      const { data: anchor } = await admin
        .from("assets")
        .select("metadata")
        .eq("id", anchorId)
        .maybeSingle();
      const p = (anchor as { metadata?: { prompt?: unknown } } | null)?.metadata
        ?.prompt;
      anchorPrompt = typeof p === "string" && p.trim() ? p : null;
    }

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.logo_finalize;

    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "logo_finalize",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const campaignId = await ensureLogoCampaign(
      admin,
      session.workspaceId,
      session.userId,
    );
    const composed = composeLogoPrompt(brief);
    const prompt = anchorPrompt ?? composed.prompt;
    const colors = composed.colors;

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "logo_finalize",
      status: "queued",
      input_params: { logoProjectId: id, prompt, colors },
      credits_charged: cost,
    });
    if (jobErr) {
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    try {
      const { requestId } = await enqueueJob(
        "logo_finalize",
        { prompt, image_size: "square_hd", ...(colors ? { colors } : {}) },
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
          error_message: "Finalize submission failed",
        })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start finalize" },
        { status: 500 },
      );
    }

    return NextResponse.json({ jobId, creditCost: cost }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
