import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { createTalkingVideoSchema } from "@/lib/validation/talking-video-schemas";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import {
  getVoice,
  getLanguage,
  type TalkingResolution,
} from "@/lib/fal/talking-video";
import {
  enqueueTtsStage,
  type TalkingJobParams,
} from "@/lib/fal/talking-pipeline";
import { generateAdScript } from "@/lib/claude/ad-script";
import { getWorkspaceBrandVoice } from "@/lib/claude/brand-voice";
import { v4 as uuidv4 } from "uuid";

// POST /api/talking-video — dedicated "product launch ad" flow: Claude script →
// ElevenLabs voice → VEED Fabric lip-sync. Separate from /api/jobs by design.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createTalkingVideoSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // Premium feature — gate to paid tiers before charging.
    const ent = await getEntitlements(session.workspaceId);
    if (!ent.isPro) {
      return NextResponse.json(
        {
          error:
            "Talking spokesperson videos are a Pro feature — upgrade to generate them.",
          upgrade: true,
        },
        { status: 403 },
      );
    }

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.talking_video;
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "talking_video",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const params: TalkingJobParams = {
      presenterImageUrl: body.presenterImageUrl,
      presenterSource: body.presenterSource,
      voice: getVoice(body.voice).id,
      resolution: body.resolution as TalkingResolution,
      tone: body.tone,
      targetSeconds: body.targetSeconds,
      language: body.language,
      product: body.product,
      script: body.scriptOverride?.trim() ?? "",
      stage: "tts",
    };

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
      type: "talking_video",
      status: "queued",
      input_params: params,
      credits_charged: cost,
    });
    if (jobErr) {
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start the job — you have not been charged." },
        { status: 500 },
      );
    }

    // Script: use the user's override, else write one with Claude. Refund on failure.
    if (!params.script) {
      try {
        const brandVoice = await getWorkspaceBrandVoice(
          session.workspaceId,
        ).catch(() => null);
        const result = await generateAdScript({
          productName: body.product.name,
          productDescription: body.product.description,
          features: body.product.features,
          callToAction: body.product.callToAction,
          tone: body.tone,
          targetSeconds: body.targetSeconds,
          language: getLanguage(body.language).label,
          brandVoice: brandVoice ?? undefined,
        });
        params.script = result.text;
      } catch (e) {
        return fail(jobId, e instanceof Error ? e.message : "Script failed");
      }
    }

    // Enqueue stage 1 (TTS). The webhook chains to lip-sync, then completes.
    try {
      const requestId = await enqueueTtsStage(jobId, params);
      return NextResponse.json(
        { jobId, requestId, creditCost: cost, status: "processing" },
        { status: 201 },
      );
    } catch (e) {
      return fail(jobId, e instanceof Error ? e.message : "Submit failed");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// Mark the job failed and refund — used when a stage fails after the debit.
async function fail(jobId: string, message: string): Promise<NextResponse> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("creative_jobs")
    .update({ status: "failed", error_message: message })
    .eq("id", jobId);
  await refundCredits(jobId);
  return NextResponse.json({ error: message }, { status: 500 });
}
