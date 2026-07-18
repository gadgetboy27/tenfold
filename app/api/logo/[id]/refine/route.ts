import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueJob } from "@/lib/fal/queue";
import { logoBriefSchema } from "@/lib/logo/brief";
import { composeLogoPrompt, composeRefinePrompt } from "@/lib/logo/promptComposer";
import { ensureLogoCampaign } from "@/app/api/logo/route";

// POST /api/logo/:id/refine — "more like this". Recraft image-to-image rejects
// an SVG anchor (422, verified live) and returns raster anyway, so refine
// regenerates a VECTOR from the project's brief plus the user's adjustment via
// text-to-vector. The result stays a true SVG the user can re-anchor to.
const bodySchema = z.object({
  instruction: z.string().trim().max(300).optional().default(""),
});

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
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();

    const { data: project } = await admin
      .from("logo_projects")
      .select("id, brief, anchor_asset_id")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    const anchorId = (project as { anchor_asset_id: string | null } | null)
      ?.anchor_asset_id;
    if (!project || !anchorId) {
      return NextResponse.json(
        { error: "Pick a concept to refine first" },
        { status: 400 },
      );
    }
    // The stored brief was validated on create; re-parse to type it and apply
    // defaults rather than trusting the raw jsonb shape.
    const brief = logoBriefSchema.parse(
      (project as { brief: unknown }).brief ?? {},
    );

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.logo_refine;

    const debit = await debitCredits(session.workspaceId, jobId, "logo_refine");
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const { prompt, colors } = composeLogoPrompt(brief);
    // Brief prompt + the "more like this" adjustment, so the regenerated vector
    // stays on-brand while nudging toward the user's tweak.
    const refinePrompt = `${prompt}. Adjustment: ${composeRefinePrompt(parsed.data.instruction)}`;

    // campaign_id is required on creative_jobs; reuse the workspace "Logos" one.
    const campaignId = await ensureLogoCampaign(
      admin,
      session.workspaceId,
      session.userId,
    );

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "logo_refine",
      status: "queued",
      input_params: { logoProjectId: id, anchorAssetId: anchorId, prompt: refinePrompt },
      credits_charged: cost,
    });
    if (jobErr) {
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    try {
      const { requestId } = await enqueueJob(
        "logo_refine",
        {
          prompt: refinePrompt,
          image_size: "square_hd",
          ...(colors ? { colors } : {}),
        },
        webhookUrl,
      );
      await admin
        .from("creative_jobs")
        .update({ fal_request_id: requestId, status: "processing" })
        .eq("id", jobId);
    } catch {
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: "Refine submission failed" })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start refine" },
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
