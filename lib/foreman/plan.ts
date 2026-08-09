import { CREDIT_COSTS } from "@/lib/credits/costs";

/**
 * The foreman's plan — what a full run does, in order, and what it costs.
 *
 * Pure and dependency-free on purpose: the cost quote shown to a user before
 * they commit ~83 credits is derived from exactly the same structure that
 * drives execution, so the two cannot disagree. A quote that under-reports is
 * a refund request; one that over-reports loses the sale.
 *
 * **The run stops at `caption`.** Publishing stays a human action — the FAQ
 * says "nothing goes out on its own", and an orchestrator that posts to 13
 * platforms unattended would break that promise for the sake of one click.
 * The run ends in `awaiting_publish` with everything assembled.
 */

export const RUN_STAGES = [
  "images",
  "anchor",
  "video",
  "music",
  "caption",
] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export type StageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface StageRecord {
  stage: RunStage;
  status: StageStatus;
  /** creative_jobs.id, when the stage is backed by an async fal job. */
  jobId?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface RunOptions {
  /** Off by default — video is 75% of the cost of a run. */
  includeVideo: boolean;
  includeMusic: boolean;
  includeCaption: boolean;
  /**
   * 30s is deliberately NOT offered. In app/api/jobs a 30s video is two 15s
   * Kling segments submitted separately and concatenated by the webhook; the
   * foreman submits one call per stage and has no segment handling, so
   * allowing 30 would render 15s and bill for 30.
   */
  videoDuration: 10 | 15;
  /** Variety pack costs more but spreads across three models. */
  variety: boolean;
}

export const DEFAULT_RUN_OPTIONS: RunOptions = {
  includeVideo: true,
  includeMusic: true,
  includeCaption: true,
  videoDuration: 10,
  variety: false,
};

/** Credit cost of a single stage under the given options. Zero if skipped. */
export function stageCost(stage: RunStage, opts: RunOptions): number {
  switch (stage) {
    case "images":
      return opts.variety
        ? CREDIT_COSTS.image_variety
        : CREDIT_COSTS.image_generation;
    // Picking the anchor is a decision, not a generation — it costs nothing.
    case "anchor":
      return 0;
    case "video":
      if (!opts.includeVideo) return 0;
      return opts.videoDuration === 15
        ? CREDIT_COSTS.video_15s
        : CREDIT_COSTS.video_10s;
    case "music":
      return opts.includeMusic ? CREDIT_COSTS.music_generation : 0;
    case "caption":
      return opts.includeCaption ? CREDIT_COSTS.script_generation : 0;
  }
}

/** The full quote, itemised — the UI shows the breakdown, not just a total. */
export function quoteRun(opts: RunOptions): {
  items: { stage: RunStage; credits: number }[];
  total: number;
} {
  const items = RUN_STAGES.map((stage) => ({
    stage,
    credits: stageCost(stage, opts),
  })).filter((i) => i.credits > 0);
  return { items, total: items.reduce((sum, i) => sum + i.credits, 0) };
}

/** The initial stage log. Skipped stages are recorded, not omitted, so the
 *  run reads as a complete account of what was and wasn't done. */
export function buildStages(opts: RunOptions): StageRecord[] {
  return RUN_STAGES.map((stage) => ({
    stage,
    status:
      stage === "anchor" || stageCost(stage, opts) > 0
        ? ("pending" as StageStatus)
        : ("skipped" as StageStatus),
  }));
}

/** The next stage that still needs doing, or null when the run is finished. */
export function nextStage(stages: StageRecord[]): RunStage | null {
  return stages.find((s) => s.status === "pending")?.stage ?? null;
}
