import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { generateHookVariants } from "@/lib/claude/hooks";
import { getWorkspaceBrandVoice } from "@/lib/claude/brand-voice";
import { v4 as uuidv4 } from "uuid";

const schema = z.object({
  campaignId: z.string().uuid(),
  topic: z.string().min(2).max(500),
  platform: z.string().max(40).default("instagram"),
  tone: z.enum(["professional", "casual", "playful"]).default("professional"),
  count: z.number().int().min(3).max(8).default(5),
});

// POST /api/hooks — generate N distinct ad hooks for A/B testing. Synchronous
// (Claude), like caption generation: debit, generate, refund on failure.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = schema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.hook_variants;
    const debit = await debitCredits(session.workspaceId, jobId, "hook_variants");
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
      type: "hook_variants",
      status: "queued",
      input_params: {
        topic: body.topic,
        platform: body.platform,
        tone: body.tone,
        count: body.count,
      },
      credits_charged: cost,
    });

    try {
      const brandVoice = await getWorkspaceBrandVoice(session.workspaceId).catch(
        () => null,
      );
      const result = await generateHookVariants({
        topic: body.topic,
        platform: body.platform,
        tone: body.tone,
        count: body.count,
        brandVoice: brandVoice ?? undefined,
      });
      await admin
        .from("creative_jobs")
        .update({ status: "completed", actual_cost_usd: result.actualCostUsd })
        .eq("id", jobId);
      return NextResponse.json(
        { jobId, variants: result.variants, creditCost: cost },
        { status: 201 },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Hook generation failed";
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
