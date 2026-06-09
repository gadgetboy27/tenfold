import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { suggestCommentSchema } from "@/lib/validation/schemas";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { generateScript } from "@/lib/claude/script";

// POST /api/assets/:id/comments/suggest — AI-draft a caption/comment for an asset.
// Mirrors the synchronous script_generation path in app/api/jobs/route.ts:
// debit → creative_jobs row → generate → save → refund atomically on failure.
export const POST = withWorkspace<{ id: string }>(
  async (req, { db, admin, session, params }) => {
    const body = suggestCommentSchema.parse(await req.json());

    const { data: asset } = await db
      .from("assets")
      .select("id, campaign_id, type, metadata")
      .eq("id", params.id)
      .single();

    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    const a = asset as {
      campaign_id: string;
      type: string;
      metadata: Record<string, unknown>;
    };

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.script_generation;

    // Ledger-atomic debit BEFORE any work (CLAUDE.md §2/§7): never generate first.
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "script_generation",
    );
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
      type: "script_generation",
      status: "queued",
      credits_charged: cost,
      input_params: { assetId: params.id, kind: "comment_suggestion" },
    });
    if (jobErr) {
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    try {
      const result = await generateScript({
        imageDescription:
          (a.metadata?.prompt as string) ?? body.context ?? `a ${a.type}`,
        businessName: session.workspaceSlug,
        platform: body.platform ?? "instagram",
        tone: body.tone ?? "professional",
        maxWords: body.maxWords ?? 40,
        variationDirection: body.direction,
      });

      await admin
        .from("creative_jobs")
        .update({ status: "completed", actual_cost_usd: result.actualCostUsd })
        .eq("id", jobId);

      const { data: comment, error: cErr } = await db
        .from("asset_comments")
        .insert({
          campaign_id: a.campaign_id,
          asset_id: params.id,
          author_id: null,
          kind: "ai_suggestion",
          body: result.text,
          anchor: {},
          job_id: jobId,
        })
        .select()
        .single();

      if (cErr) throw new Error(cErr.message);

      return NextResponse.json(
        { comment, creditCost: cost, newBalance: debit.newBalance },
        { status: 201 },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Suggestion failed";
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  },
);
