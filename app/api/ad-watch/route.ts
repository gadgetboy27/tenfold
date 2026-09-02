import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { sampleVideoFrames, probeDurationSec } from "@/lib/composition/frames";
import { watchAd } from "@/lib/claude/ad-watcher";

/**
 * POST /api/ad-watch — an outside-eye review of a finished video.
 *
 * Samples frames from the campaign's video, shows them to Claude, and returns
 * observations plus optional overlay proposals. Nothing is applied here: the
 * client decides what to accept, and the composition change goes through the
 * normal approval gate before it can publish.
 *
 * Credits follow the layout_autofix pattern exactly, including its ordering
 * rule: refund_credits() reverses a debit by reading creative_jobs.credits_
 * charged, so THE JOB ROW MUST EXIST BEFORE THE DEBIT or a failed insert
 * strands a charge with nothing to reverse.
 */
const bodySchema = z.object({
  campaignId: z.string().uuid(),
  /** Which video to watch. Must belong to this campaign — checked below. */
  assetId: z.string().uuid(),
  platforms: z.array(z.string().min(1).max(40)).max(12).default([]),
  caption: z.string().max(4000).nullish(),
  /** Text already on the ad, so the watcher doesn't propose it again. */
  existingText: z.array(z.string().max(200)).max(20).default([]),
});

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { campaignId, assetId, platforms, caption, existingText } = parsed.data;

  const { data: campaign } = await db
    .from("campaigns")
    .select("id, prompt")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // The asset is re-read from the DB rather than trusting a URL from the
  // client: a caller-supplied URL would let anyone point our FFmpeg and our
  // vision budget at an arbitrary host.
  const { data: asset } = await db
    .from("assets")
    .select("id, url, type")
    .eq("id", assetId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  const video = asset as { url: string; type: string } | null;
  if (!video || !["video", "composed_video"].includes(video.type)) {
    return NextResponse.json(
      { error: "That isn't a video in this campaign" },
      { status: 404 },
    );
  }

  const jobId = uuidv4();
  const { error: jobErr } = await admin.from("creative_jobs").insert({
    id: jobId,
    campaign_id: campaignId,
    workspace_id: session.workspaceId,
    type: "ad_watch",
    status: "processing",
    input_params: { assetId, platforms },
    credits_charged: CREDIT_COSTS.ad_watch,
  });
  if (jobErr) {
    return NextResponse.json(
      { error: "Could not start the review" },
      { status: 500 },
    );
  }

  const debit = await debitCredits(session.workspaceId, jobId, "ad_watch");
  if (!debit.success) {
    await admin
      .from("creative_jobs")
      .update({ status: "failed", error_message: "Insufficient credits" })
      .eq("id", jobId);
    return NextResponse.json(
      { error: "Insufficient credits" },
      { status: 402 },
    );
  }

  try {
    const [frames, duration] = await Promise.all([
      sampleVideoFrames(video.url, 6),
      probeDurationSec(video.url),
    ]);
    // No frames means we never reached the model — refund rather than charge
    // for an analysis that could not happen.
    if (frames.length === 0) {
      throw new Error("Couldn't read this video — try re-exporting it.");
    }

    const result = await watchAd({
      frames,
      brief: (campaign as { prompt?: string }).prompt ?? "",
      caption: caption ?? null,
      platforms,
      durationSec: duration ?? 10,
      existingText,
    });

    // completed_at, not an output column: creative_jobs has no output_data
    // field, and writing one would have failed silently — the result travels
    // in the response and is the client's to keep.
    await admin
      .from("creative_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", jobId);

    return NextResponse.json({ ...result, framesSeen: frames.length });
  } catch (err) {
    // Anything from here refunds: the job row exists, so the ledger reverses
    // cleanly and the user is not charged for a review they never got.
    await refundCredits(jobId);
    const message =
      err instanceof Error ? err.message : "The review couldn't be completed";
    await admin
      .from("creative_jobs")
      .update({ status: "failed", error_message: message })
      .eq("id", jobId);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
