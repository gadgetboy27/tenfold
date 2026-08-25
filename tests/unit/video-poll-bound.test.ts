import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * The UI's patience has to exceed how long the work actually takes, or a
 * perfectly good render is reported to the user as a failure.
 *
 * That is not hypothetical. The bound was 160 ticks x 2s = 320s, while a 15s
 * video takes 342s at the median across production — 4 of 6 runs exceeded it,
 * and one 10s run took 500s. Video "not working" was the UI giving up on files
 * that existed, were stitched, and were playable.
 *
 * These read the source because the bound is a literal inside a component with
 * no seam to inject it through. Extracting a constant purely to test it would
 * be worse than checking the number where it lives — but it does mean this
 * test has to be updated deliberately, which is the point.
 */

const SOURCE = readFileSync("components/studio/Studio.tsx", "utf8");

/** Longest render observed in production, in seconds. */
const SLOWEST_OBSERVED_SEC = 500;

function videoPollBudgetSec(): number {
  // for (let i = 0; i < N && !landed; i++)  ...  setTimeout(r, 2000)
  const ticks = SOURCE.match(/for \(let i = 0; i < (\d+) && !landed; i\+\+\)/);
  expect(ticks, "video poll loop not found — did the shape change?").not.toBeNull();
  return Number(ticks![1]) * 2;
}

describe("video poll bound", () => {
  it("waits longer than the slowest render ever observed", () => {
    expect(videoPollBudgetSec()).toBeGreaterThan(SLOWEST_OBSERVED_SEC);
  });

  it("keeps real headroom over the slowest, not a hair's breadth", () => {
    // The previous bound failed by 8 seconds on a 328s render. A margin that
    // thin means the next slightly-slower model release silently reintroduces
    // the bug.
    expect(videoPollBudgetSec()).toBeGreaterThan(SLOWEST_OBSERVED_SEC * 1.5);
  });

  it("has progress labels covering the whole wait", () => {
    // Labels that stop early are their own failure: the last one sits on screen
    // for minutes and reads as a hang, even while the render is healthy.
    const block = SOURCE.match(
      /const VIDEO_STAGE_LABELS = \[([\s\S]*?)\] as const;/,
    );
    expect(block).not.toBeNull();
    const thresholds = [...block![1].matchAll(/\[(\d+),/g)].map((m) =>
      Number(m[1]),
    );
    expect(Math.max(...thresholds)).toBeGreaterThanOrEqual(300);
  });
});
