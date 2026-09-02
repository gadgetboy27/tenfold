import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { sampleVideoFrames } from "@/lib/composition/frames";
import { watchAd } from "@/lib/claude/ad-watcher";
import { displayVideo } from "@/lib/campaign/video-pick";

/** A clip row as selected below, before the createdAt alias is added. */
interface ClipRow {
  id: string;
  url: string;
  type: string;
  created_at: string;
}

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
  /**
   * Which video to watch. Optional — omitted, the route reviews the video
   * that would actually PUBLISH, which is nearly always what you want.
   */
  assetId: z.string().uuid().nullish(),
  platforms: z.array(z.string().min(1).max(40)).max(12).default([]),
  caption: z.string().max(4000).nullish(),
  /** Text already on the ad, so the watcher doesn't propose it again. */
  existingText: z.array(z.string().max(200)).max(20).default([]),
  /** Wording to place verbatim, when you already know the claim. */
  steer: z.string().max(120).nullish(),
});

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { campaignId, assetId, platforms, caption, existingText, steer } =
    parsed.data;

  const { data: campaign } = await db
    .from("campaigns")
    .select("id, prompt")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Always resolved from the DB, never from a client-supplied URL: that would
  // let a caller point our FFmpeg and our vision budget at an arbitrary host.
  const { data: clipRows } = await db
    .from("assets")
    .select("id, url, type, created_at")
    .eq("campaign_id", campaignId)
    .in("type", ["video", "composed_video"])
    .order("created_at", { ascending: false });

  const clips = ((clipRows ?? []) as ClipRow[]).map((r) => ({
    ...r,
    createdAt: r.created_at,
  }));

  // With no assetId, review THE VIDEO THAT WOULD PUBLISH — the same rule
  // /api/publish follows (lib/campaign/video-pick.ts). Reviewing a different
  // cut from the one going out would be worse than not reviewing at all.
  const { data: campRow } = await db
    .from("campaigns")
    .select("publish_asset_id")
    .eq("id", campaignId)
    .maybeSingle();
  const pickedId =
    (campRow as { publish_asset_id: string | null } | null)?.publish_asset_id ??
    null;

  const video = assetId
    ? (clips.find((c) => c.id === assetId) ?? null)
    : displayVideo(clips, pickedId);

  if (!video) {
    return NextResponse.json(
      {
        error: assetId
          ? "That isn't a video in this campaign"
          : "This project has no video to review yet.",
      },
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
    input_params: { assetId: video.id, platforms },
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
    // One download, one probe, six local seeks — the sampler owns all of it
    // now, so duration comes back from the same temp file rather than costing
    // a second fetch of the whole clip.
    const { frames, durationSec } = await sampleVideoFrames(video.url, 6);
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
      durationSec: durationSec ?? 10,
      existingText,
      steer,
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
    // 422, not 502: Cloudflare intercepts 5xx from the origin and serves its
    // own branded error page, so a 502 threw away the actual reason and showed
    // the user "Bad gateway" instead. Verified against production.
    return NextResponse.json({ error: message }, { status: 422 });
  }
});
