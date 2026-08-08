import { v4 as uuidv4 } from "uuid";
import type { SupabaseClient } from "@supabase/supabase-js";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueJob } from "@/lib/fal/queue";
import { buildFalInput } from "@/lib/fal/build-input";
import { FAL_MODELS } from "@/lib/fal/models";
import { generateScript } from "@/lib/claude/script";
import { CREDIT_COSTS, type CreditCostKey } from "@/lib/credits/costs";
import {
  nextStage,
  stageCost,
  type RunOptions,
  type RunStage,
  type StageRecord,
} from "./plan";

/**
 * The foreman's hands — starts one stage of a run and records the outcome.
 *
 * Stages are of two kinds and they advance differently:
 *
 *  - **Async (images, video, music)** submit a fal job and return. The stage
 *    stays `running` until the fal webhook reports back; `advanceRun` in
 *    ./advance.ts moves it on. Nothing here waits.
 *  - **Synchronous (anchor, caption)** complete inline and the caller moves
 *    straight to the next stage.
 *
 * Every async job carries `runId`/`runStage` in `creative_jobs.input_params` so
 * the webhook can identify it without a schema change.
 *
 * Credit discipline follows CLAUDE.md §1 and §6 exactly: debit BEFORE the job
 * exists, refund if submission fails. A run is just several of those in
 * sequence — there is no batch debit, because a run that dies at stage 3 must
 * not have charged for stages 4 and 5.
 */

export interface RunRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  stages: StageRecord[];
  credits_spent: number;
}

export interface StageContext {
  admin: SupabaseClient;
  run: RunRow;
  options: RunOptions;
  /** Campaign prompt — the creative seed for every stage. */
  prompt: string;
  /** Set once the anchor stage has run. */
  anchorImageUrl?: string | null;
  campaignName: string;
}

const CREDIT_KEY: Partial<Record<RunStage, CreditCostKey>> = {
  images: "image_generation",
  music: "music_generation",
  caption: "script_generation",
};

function videoCreditKey(opts: RunOptions): CreditCostKey {
  return opts.videoDuration === 30
    ? "video_30s"
    : opts.videoDuration === 15
      ? "video_15s"
      : "video_10s";
}

/** Patch one stage in the run's log, leaving the others untouched. */
export function patchStage(
  stages: StageRecord[],
  stage: RunStage,
  patch: Partial<StageRecord>,
): StageRecord[] {
  return stages.map((s) => (s.stage === stage ? { ...s, ...patch } : s));
}

async function saveStages(
  admin: SupabaseClient,
  runId: string,
  stages: StageRecord[],
  extra: Record<string, unknown> = {},
): Promise<void> {
  await admin
    .from("campaign_runs")
    .update({ stages, updated_at: new Date().toISOString(), ...extra })
    .eq("id", runId);
}

/**
 * Picks the anchor automatically.
 *
 * v1 takes the earliest generated image. That is a deliberate placeholder, not
 * a considered choice: the genuinely interesting option is `style_performance()`
 * (migration 0025), which already ranks a workspace's styles by real engagement
 * — CLAUDE.md §10 notes nothing currently feeds it back into generation, and
 * this is the obvious place to close that loop. Doing it here without measuring
 * whether it beats "first" would be guessing, so the seam is left explicit.
 */
async function pickAnchor(
  admin: SupabaseClient,
  campaignId: string,
): Promise<{ id: string; url: string } | null> {
  const { data } = await admin
    .from("assets")
    .select("id, url, metadata, created_at")
    .eq("campaign_id", campaignId)
    .eq("type", "image")
    .order("created_at", { ascending: true });
  const usable = (data ?? []).filter(
    (a) => !(a.metadata as { hd?: boolean } | null)?.hd,
  );
  const first = usable[0] as { id: string; url: string } | undefined;
  return first ? { id: first.id, url: first.url } : null;
}

/**
 * Runs one stage. Returns whether the caller should immediately continue to the
 * next stage (synchronous stages) or stop and wait for a webhook (async ones).
 */
export async function runStage(
  ctx: StageContext,
  stage: RunStage,
): Promise<{ continueNow: boolean; error?: string }> {
  const { admin, run, options } = ctx;
  const now = new Date().toISOString();

  let stages = patchStage(run.stages, stage, {
    status: "running",
    startedAt: now,
  });
  await saveStages(admin, run.id, stages, { current_stage: stage });

  const fail = async (error: string) => {
    stages = patchStage(stages, stage, {
      status: "failed",
      error,
      endedAt: new Date().toISOString(),
    });
    await saveStages(admin, run.id, stages, {
      status: "failed",
      error,
      current_stage: null,
    });
    return { continueNow: false, error };
  };

  // ── Synchronous: choose the anchor ──────────────────────────────────────
  if (stage === "anchor") {
    const anchor = await pickAnchor(admin, run.campaign_id);
    if (!anchor) return fail("No images to choose an anchor from");
    await admin
      .from("campaigns")
      .update({ anchor_asset_id: anchor.id })
      .eq("id", run.campaign_id);
    ctx.anchorImageUrl = anchor.url;
    stages = patchStage(stages, stage, {
      status: "completed",
      endedAt: new Date().toISOString(),
    });
    await saveStages(admin, run.id, stages);
    return { continueNow: true };
  }

  const creditKey =
    stage === "video" ? videoCreditKey(options) : CREDIT_KEY[stage];
  if (!creditKey) return fail(`No credit mapping for stage ${stage}`);
  const cost = stageCost(stage, options);
  const jobId = uuidv4();

  // Debit first, always — never create a job we haven't charged for.
  const debit = await debitCredits(run.workspace_id, jobId, creditKey);
  if (!debit.success) {
    return fail(`Not enough credits for ${stage} (needs ${cost})`);
  }

  // ── Synchronous: the caption is a Claude call, not a fal job ────────────
  if (stage === "caption") {
    try {
      const script = await generateScript({
        // The campaign prompt describes the scene, which is what this field
        // means — see lib/claude/script.ts.
        imageDescription: ctx.prompt,
        businessName: ctx.campaignName,
        platform: "instagram",
        tone: "professional",
        maxWords: 60,
      });
      await admin.from("creative_jobs").insert({
        id: jobId,
        campaign_id: run.campaign_id,
        workspace_id: run.workspace_id,
        type: "script_generation",
        status: "completed",
        input_params: { runId: run.id, runStage: stage, prompt: ctx.prompt },
        credits_charged: cost,
        completed_at: new Date().toISOString(),
      });
      const { data: camp } = await admin
        .from("campaigns")
        .select("expansion_data")
        .eq("id", run.campaign_id)
        .maybeSingle();
      const expansion =
        ((camp as { expansion_data?: Record<string, unknown> } | null)
          ?.expansion_data as Record<string, unknown>) ?? {};
      await admin
        .from("campaigns")
        .update({
          expansion_data: {
            ...expansion,
            script: { content: script.text },
          },
        })
        .eq("id", run.campaign_id);

      stages = patchStage(stages, stage, {
        status: "completed",
        jobId,
        endedAt: new Date().toISOString(),
      });
      await saveStages(admin, run.id, stages, {
        credits_spent: run.credits_spent + cost,
      });
      return { continueNow: true };
    } catch (err) {
      await refundCredits(jobId);
      return fail(err instanceof Error ? err.message : "Caption failed");
    }
  }

  // ── Async: images, video, music ─────────────────────────────────────────
  const params: Record<string, unknown> =
    stage === "images"
      ? { style: "Photorealistic", imageSize: "square_hd" }
      : stage === "video"
        ? {
            imageUrl: ctx.anchorImageUrl,
            videoStyle: "Cinematic",
          }
        : { genre: "Lo-fi Chill", durationSec: options.videoDuration };

  const jobType =
    stage === "images"
      ? "image_generation"
      : stage === "video"
        ? `video_${options.videoDuration}s`
        : "music_generation";

  const modelKey =
    stage === "images"
      ? "image_generation"
      : stage === "video"
        ? "video_generation"
        : "music_generation";

  try {
    await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: run.campaign_id,
      workspace_id: run.workspace_id,
      type: jobType,
      status: "queued",
      // How the webhook knows this job belongs to a run — no schema change.
      input_params: { ...params, runId: run.id, runStage: stage },
      credits_charged: cost,
    });

    const falInput = buildFalInput(jobType, params, ctx.prompt);
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    const { requestId } = await enqueueJob(
      modelKey as keyof typeof FAL_MODELS,
      falInput as Record<string, unknown>,
      webhookUrl,
    );
    await admin
      .from("creative_jobs")
      .update({ fal_request_id: requestId, status: "processing" })
      .eq("id", jobId);

    stages = patchStage(stages, stage, { status: "running", jobId });
    await saveStages(admin, run.id, stages, {
      status: "running",
      credits_spent: run.credits_spent + cost,
    });
    // Async — the webhook advances this one.
    return { continueNow: false };
  } catch (err) {
    await refundCredits(jobId);
    await admin
      .from("creative_jobs")
      .update({ status: "failed", error_message: "Foreman submit failed" })
      .eq("id", jobId);
    return fail(
      err instanceof Error ? err.message : `${stage} failed to start`,
    );
  }
}

/** Drive the run forward until it hits an async stage or finishes. */
export async function driveRun(ctx: StageContext): Promise<void> {
  for (;;) {
    const stage = nextStage(ctx.run.stages);
    if (!stage) {
      await ctx.admin
        .from("campaign_runs")
        .update({
          status: "awaiting_publish",
          current_stage: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ctx.run.id);
      return;
    }
    const { continueNow } = await runStage(ctx, stage);
    if (!continueNow) return;
    // Re-read the stage log we just wrote so the loop sees current state.
    const { data } = await ctx.admin
      .from("campaign_runs")
      .select("stages, credits_spent")
      .eq("id", ctx.run.id)
      .maybeSingle();
    const row = data as Pick<RunRow, "stages" | "credits_spent"> | null;
    if (!row) return;
    ctx.run.stages = row.stages;
    ctx.run.credits_spent = row.credits_spent;
  }
}

export { CREDIT_COSTS };
