import { describe, it, expect } from "vitest";
import {
  EFFECTS_IN,
  EFFECTS_OUT,
  effectsOf,
  motionAt,
  sampledExpr,
} from "@/lib/composition/effects";
import type { Layer } from "@/lib/composition/layers";

const ctx = { W: 1080, H: 1920 };

const base: Layer = {
  id: "l1",
  kind: "image",
  src: "https://example.com/logo.png",
  pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
  scale: 1,
  rotationDeg: 0,
  opacity: 1,
  blend: "normal",
  appearAt: 2,
  disappearAt: null,
  fadeSec: 0,
  effects: {
    in: { kind: "bounce", durationSec: 1 },
    out: { kind: "none", durationSec: 0.8 },
    loop: "none",
  },
};

describe("effect curves", () => {
  it("every entrance lands exactly at rest (p=1)", () => {
    for (const [kind, e] of Object.entries(EFFECTS_IN)) {
      const m = e.fn(1, ctx);
      expect(Math.abs(m.dx), `${kind} dx`).toBeLessThan(2);
      expect(Math.abs(m.dy), `${kind} dy`).toBeLessThan(2);
      expect(Math.abs(m.rotDeg), `${kind} rot`).toBeLessThan(1);
      expect(m.alpha, `${kind} alpha`).toBeCloseTo(1, 1);
    }
  });

  it("every entrance starts displaced, transparent or rotated (p=0)", () => {
    for (const [kind, e] of Object.entries(EFFECTS_IN)) {
      if (kind === "none") continue;
      const m = e.fn(0, ctx);
      const moved =
        Math.abs(m.dx) > 10 ||
        Math.abs(m.dy) > 10 ||
        Math.abs(m.rotDeg) > 5 ||
        m.alpha < 0.5;
      expect(moved, `${kind} must start off-rest`).toBe(true);
    }
  });

  it("every exit ends displaced or invisible (p=1)", () => {
    for (const [kind, e] of Object.entries(EFFECTS_OUT)) {
      if (kind === "none") continue;
      const m = e.fn(1, ctx);
      const gone =
        Math.abs(m.dx) > 100 || Math.abs(m.dy) > 100 || m.alpha < 0.1;
      expect(gone, `${kind} must end off-screen or transparent`).toBe(true);
    }
  });

  it("kick flies in with spin and an arc", () => {
    const mid = EFFECTS_IN["kick-left"].fn(0.5, ctx);
    expect(mid.dx).toBeLessThan(0); // still left of rest
    expect(mid.dy).toBeLessThan(0); // arcing above the flight line
    expect(Math.abs(mid.rotDeg)).toBeGreaterThan(10); // spinning
  });

  it("walk bobs up and down on the way in", () => {
    const ys = [0.1, 0.2, 0.3, 0.4].map(
      (p) => EFFECTS_IN["walk-left"].fn(p, ctx).dy,
    );
    expect(Math.min(...ys)).toBeLessThan(-4); // lifts off the ground
    expect(Math.max(...ys)).toBeGreaterThan(-15); // and comes back down
  });
});

describe("motionAt", () => {
  it("is null outside the visible window and at rest mid-clip", () => {
    expect(motionAt(base, 1.9, 10, ctx)).toBeNull();
    const rest = motionAt(base, 6, 10, ctx)!;
    expect(rest).toMatchObject({ dx: 0, dy: 0, rotDeg: 0, alpha: 1 });
  });

  it("bounces in from above then settles", () => {
    const early = motionAt(base, 2.1, 10, ctx)!;
    expect(early.dy).toBeLessThan(-500); // still falling from off-frame
    const settled = motionAt(base, 3.0, 10, ctx)!;
    expect(Math.abs(settled.dy)).toBeLessThan(2);
  });

  it("maps legacy fadeSec onto fade effects", () => {
    const legacy: Layer = { ...base, effects: undefined, fadeSec: 2 };
    expect(effectsOf(legacy).in).toEqual({ kind: "fade", durationSec: 2 });
    const m = motionAt(legacy, 3, 10, ctx)!; // halfway through fade-in
    expect(m.alpha).toBeCloseTo(0.5);
  });

  it("multiplies opacity into the effect alpha", () => {
    const dim: Layer = { ...base, opacity: 0.5 };
    expect(motionAt(dim, 6, 10, ctx)!.alpha).toBeCloseTo(0.5);
  });
});

describe("sampledExpr", () => {
  it("emits a piecewise window with the exact sampled boundary values", () => {
    const fn = (t: number) => Math.sin(t) * 100;
    const expr = sampledExpr(fn, 2, 1, 8);
    expect(expr.startsWith("if(lt(t,2),")).toBe(true); // clamps before window
    expect(expr).toContain(`${Math.round(Math.sin(2) * 100 * 1000) / 1000}`); // first sample
    expect(expr).toContain(`${Math.round(Math.sin(3) * 100 * 1000) / 1000}`); // last sample
    expect((expr.match(/if\(lt\(t,/g) ?? []).length).toBe(9); // n+1 guards
    expect(expr).not.toMatch(/-0[^.\d]/); // no negative zeros for ffmpeg
  });
});
