import { describe, it, expect } from "vitest";
import {
  fxCycles,
  fxPhaseAt,
  resolveFxWindow,
  staticIntervals,
  staticVisible,
} from "@/lib/composition/fx/timing";
import { defaultFx } from "@/lib/composition/fx/catalog";
import type { PixelFx } from "@/lib/composition/fx/types";

/**
 * The reason timing is a PERCENTAGE: nobody knows whether the ad will run 10,
 * 15 or 30 seconds. These pin that the same percentage lands at the same
 * relative place on every length, and that an effect always plays in full.
 */
const fx = (over: Partial<PixelFx> = {}): PixelFx => ({
  ...defaultFx("crumble"),
  startPct: 40,
  lengthSec: 1,
  ...over,
});

describe("resolveFxWindow", () => {
  it("puts the same percentage at the same relative place on every clip length", () => {
    const rel = [10, 15, 30].map(
      (clip) => resolveFxWindow(fx(), clip).start / clip,
    );
    for (const r of rel) expect(r).toBeCloseTo(0.4, 6);
  });

  it("converts to seconds against the clip it is given", () => {
    expect(resolveFxWindow(fx({ startPct: 50 }), 10).start).toBe(5);
    expect(resolveFxWindow(fx({ startPct: 50 }), 30).start).toBe(15);
  });

  it("never lets the effect run past the end — 100% starts it as late as it can finish", () => {
    const w = resolveFxWindow(fx({ startPct: 100, lengthSec: 1.5 }), 10);
    expect(w.end).toBeCloseTo(10, 9);
    expect(w.start).toBeCloseTo(8.5, 9);
  });

  it("starts at 0 for 0%, and never negative on a clip shorter than the effect", () => {
    expect(resolveFxWindow(fx({ startPct: 0 }), 10).start).toBe(0);
    expect(resolveFxWindow(fx({ startPct: 80, lengthSec: 3 }), 2).start).toBe(
      0,
    );
  });

  it("a pulse repeated N times lasts N runs; a transition ignores repeat", () => {
    const pulse = fx({ ...defaultFx("electric"), repeat: 3, lengthSec: 1 });
    expect(fxCycles(pulse)).toBe(3);
    const w = resolveFxWindow(pulse, 20);
    expect(w.end - w.start).toBe(3);
    expect(fxCycles(fx({ repeat: 4 }))).toBe(1);
  });
});

describe("fxPhaseAt", () => {
  const f = fx({ startPct: 50, lengthSec: 2 }); // 10s clip → plays 5s..7s
  it("is before, active, then after", () => {
    expect(fxPhaseAt(f, 10, 4.99).phase).toBe("before");
    expect(fxPhaseAt(f, 10, 5).phase).toBe("active");
    expect(fxPhaseAt(f, 10, 6.99).phase).toBe("active");
    expect(fxPhaseAt(f, 10, 7).phase).toBe("after");
  });
  it("reports progress 0..1 through the run", () => {
    expect(fxPhaseAt(f, 10, 5).progress).toBe(0);
    expect(fxPhaseAt(f, 10, 6).progress).toBeCloseTo(0.5, 9);
  });
  it("restarts progress each repeat and reports the cycle", () => {
    const p = fx({
      ...defaultFx("glitch"),
      startPct: 0,
      lengthSec: 1,
      repeat: 3,
    });
    const a = fxPhaseAt(p, 10, 0.25);
    const b = fxPhaseAt(p, 10, 1.25);
    const c = fxPhaseAt(p, 10, 2.75);
    expect([a.cycle, b.cycle, c.cycle]).toEqual([0, 1, 2]);
    expect(a.progress).toBeCloseTo(0.25, 9);
    expect(b.progress).toBeCloseTo(0.25, 9);
    expect(c.progress).toBeCloseTo(0.75, 9);
    expect(fxPhaseAt(p, 10, 3).phase).toBe("after");
  });
  it("tracks the clip: the same time is a different phase on a longer clip", () => {
    expect(fxPhaseAt(f, 10, 5.5).phase).toBe("active");
    expect(fxPhaseAt(f, 30, 5.5).phase).toBe("before"); // 50% of 30s is 15s
  });
});

describe("what is on show when", () => {
  it("a transition going out: whole, then gone", () => {
    const o = fx({ mode: "out" });
    expect(staticVisible(o, "before")).toBe(true);
    expect(staticVisible(o, "active")).toBe(false);
    expect(staticVisible(o, "after")).toBe(false);
  });
  it("a transition coming in: gone, then whole", () => {
    const i = fx({ mode: "in" });
    expect(staticVisible(i, "before")).toBe(false);
    expect(staticVisible(i, "active")).toBe(false);
    expect(staticVisible(i, "after")).toBe(true);
  });
  it("a pulse is whole on both sides", () => {
    const p = fx(defaultFx("electric"));
    expect(staticVisible(p, "before")).toBe(true);
    expect(staticVisible(p, "after")).toBe(true);
    expect(staticVisible(p, "active")).toBe(false);
  });
});

describe("staticIntervals — what the export overlays the plain picture in", () => {
  const win = (f: PixelFx) => resolveFxWindow(f, 10);
  it("out: from the start to the effect", () => {
    const f = fx({ mode: "out", startPct: 40, lengthSec: 1 });
    expect(staticIntervals(f, win(f), 0, 10)).toEqual([[0, 4]]);
  });
  it("in: from the end of the effect to the end", () => {
    const f = fx({ mode: "in", startPct: 40, lengthSec: 1 });
    expect(staticIntervals(f, win(f), 0, 10)).toEqual([[5, 10]]);
  });
  it("a pulse: both sides", () => {
    const f = fx({ ...defaultFx("shine"), startPct: 40, lengthSec: 1 });
    expect(staticIntervals(f, win(f), 0, 10)).toEqual([
      [0, 4],
      [5, 10],
    ]);
  });
  it("is clipped to the layer's own appear/disappear window", () => {
    const f = fx({ ...defaultFx("shine"), startPct: 40, lengthSec: 1 });
    expect(staticIntervals(f, win(f), 2, 8)).toEqual([
      [2, 4],
      [5, 8],
    ]);
  });
  it("drops an empty stretch instead of emitting a zero-length one", () => {
    const f = fx({ mode: "out", startPct: 0, lengthSec: 1 });
    expect(staticIntervals(f, win(f), 0, 10)).toEqual([]);
  });
  it("never overlaps the effect window (a boundary frame is drawn by one layer)", () => {
    for (const kind of ["crumble", "electric"] as const) {
      const f = fx({ ...defaultFx(kind), startPct: 33, lengthSec: 1.3 });
      const w = win(f);
      for (const [a, b] of staticIntervals(f, w, 0, 10)) {
        expect(b <= w.start || a >= w.end).toBe(true);
      }
    }
  });
});
