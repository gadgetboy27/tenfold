import { describe, it, expect } from "vitest";
import {
  quoteRun,
  buildStages,
  nextStage,
  stageCost,
  DEFAULT_RUN_OPTIONS,
  RUN_STAGES,
  type RunOptions,
} from "@/lib/foreman/plan";
import { CREDIT_COSTS } from "@/lib/credits/costs";

const opts = (o: Partial<RunOptions> = {}): RunOptions => ({
  ...DEFAULT_RUN_OPTIONS,
  ...o,
});

describe("foreman quote", () => {
  it("matches the sum of the real CREDIT_COSTS, not a hardcoded figure", () => {
    // Pinning the total to a literal would let the quote drift the next time
    // anything is repriced — exactly the drift lib/credits/CLAUDE.md warns of.
    const expected =
      CREDIT_COSTS.image_generation +
      CREDIT_COSTS.video_10s +
      CREDIT_COSTS.music_generation +
      CREDIT_COSTS.script_generation;
    expect(quoteRun(opts()).total).toBe(expected);
  });

  it("charges nothing for picking the anchor", () => {
    expect(stageCost("anchor", opts())).toBe(0);
  });

  it("drops the cost of anything switched off", () => {
    const full = quoteRun(opts()).total;
    const noVideo = quoteRun(opts({ includeVideo: false })).total;
    expect(noVideo).toBe(full - CREDIT_COSTS.video_10s);
    expect(noVideo).toBeLessThan(full);
  });

  it("prices the chosen video length", () => {
    expect(stageCost("video", opts({ videoDuration: 30 }))).toBe(
      CREDIT_COSTS.video_30s,
    );
    expect(stageCost("video", opts({ videoDuration: 15 }))).toBe(
      CREDIT_COSTS.video_15s,
    );
  });

  it("omits zero-cost stages from the itemised breakdown", () => {
    const q = quoteRun(opts({ includeMusic: false, includeCaption: false }));
    expect(q.items.map((i) => i.stage)).toEqual(["images", "video"]);
  });
});

describe("foreman stages", () => {
  it("records skipped stages rather than omitting them", () => {
    const stages = buildStages(opts({ includeVideo: false }));
    expect(stages).toHaveLength(RUN_STAGES.length);
    expect(stages.find((s) => s.stage === "video")?.status).toBe("skipped");
  });

  it("keeps the anchor stage even though it is free", () => {
    const stages = buildStages(opts());
    expect(stages.find((s) => s.stage === "anchor")?.status).toBe("pending");
  });

  it("walks stages in order and finishes", () => {
    const stages = buildStages(opts({ includeMusic: false }));
    expect(nextStage(stages)).toBe("images");
    stages[0].status = "completed";
    expect(nextStage(stages)).toBe("anchor");
    for (const s of stages) if (s.status === "pending") s.status = "completed";
    expect(nextStage(stages)).toBeNull();
  });

  it("never plans a publish stage — publishing stays a human action", () => {
    expect(RUN_STAGES).not.toContain("publish");
  });
});
