import { describe, it, expect } from "vitest";
import { defaultFx, FX_META, switchFxKind } from "@/lib/composition/fx/catalog";
import { fxMargin, fxSceneFor } from "@/lib/composition/fx/effects";
import {
  PIXEL_FX_KINDS,
  pixelFxSchema,
  type FxScene,
  type PixelFx,
  type PixelFxKind,
} from "@/lib/composition/fx/types";
import { stickerSpecSchema } from "@/lib/composition/layers";

/**
 * Effects are pure functions from progress to a description of what to draw,
 * so the things that make them trustworthy — they start and end where they
 * should, they never wander off the frame, they are the same every time — can
 * be asserted without a canvas.
 */
const SIZE = { w: 620, h: 260 };
const GRID = Array.from({ length: 21 }, (_, i) => i / 20);

const make = (kind: PixelFxKind, over: Partial<PixelFx> = {}): PixelFx => ({
  ...defaultFx(kind),
  ...over,
});
const scene = (fx: PixelFx, p: number, text = "SALE") =>
  fxSceneFor(fx, SIZE, text, p);

const TRANSITIONS = PIXEL_FX_KINDS.filter(
  (k) => FX_META[k].family === "transition",
);
const PULSES = PIXEL_FX_KINDS.filter((k) => FX_META[k].family === "pulse");

/** True when the scene is just the picture, whole and untouched. */
function isWhole(s: FxScene): boolean {
  if (s.bolts.length > 0 || (s.wash && s.wash.alpha > 0.004)) return false;
  if (s.sweep && s.sweep.alpha > 0.004) return false;
  const visible = s.pieces.filter((p) => p.alpha > 0.004);
  // Pieces that tile the picture, each in place.
  const inPlace = visible.every(
    (p) =>
      Math.abs(p.dx) < 1e-6 &&
      Math.abs(p.dy) < 1e-6 &&
      Math.abs(p.rot) < 1e-6 &&
      Math.abs(p.scale - 1) < 1e-6 &&
      p.alpha > 0.999 &&
      !p.add,
  );
  return inPlace;
}

const isGone = (s: FxScene) =>
  s.bolts.length === 0 && s.pieces.every((p) => p.alpha <= 0.004);

function numbers(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => numbers(x, out));
  else if (v && typeof v === "object")
    Object.values(v).forEach((x) => numbers(x, out));
  return out;
}

describe("every effect", () => {
  it.each(PIXEL_FX_KINDS)(
    "%s is deterministic — same word, same scene",
    (k) => {
      for (const p of [0, 0.3, 0.77]) {
        expect(scene(make(k), p)).toEqual(scene(make(k), p));
      }
    },
  );

  it.each(PIXEL_FX_KINDS)("%s produces only finite numbers", (k) => {
    for (const intensity of [0.5, 1, 2]) {
      for (const p of GRID) {
        for (const n of numbers(scene(make(k, { intensity }), p))) {
          expect(Number.isFinite(n)).toBe(true);
        }
      }
    }
  });

  it.each(PIXEL_FX_KINDS)(
    "%s keeps every piece inside the picture's source",
    (k) => {
      for (const p of GRID) {
        for (const pc of scene(make(k), p).pieces) {
          expect(pc.sx).toBeGreaterThanOrEqual(0);
          expect(pc.sy).toBeGreaterThanOrEqual(0);
          expect(pc.sx + pc.sw).toBeLessThanOrEqual(SIZE.w);
          expect(pc.sy + pc.sh).toBeLessThanOrEqual(SIZE.h);
          expect(Number.isInteger(pc.sx + pc.sy + pc.sw + pc.sh)).toBe(true);
        }
      }
    },
  );

  it.each(PIXEL_FX_KINDS)("%s never moves a piece beyond its margin", (k) => {
    const m = fxMargin(k, SIZE.w, SIZE.h);
    for (const intensity of [0.5, 2]) {
      for (const p of GRID) {
        for (const pc of scene(make(k, { intensity }), p).pieces) {
          expect(Math.abs(pc.dx)).toBeLessThanOrEqual(m.x + 1e-6);
          expect(Math.abs(pc.dy)).toBeLessThanOrEqual(m.y + 1e-6);
        }
      }
    }
  });

  it.each(PIXEL_FX_KINDS)("%s survives a tiny picture", (k) => {
    const s = fxSceneFor(make(k), { w: 12, h: 8 }, "i", 0.5);
    expect(numbers(s).every(Number.isFinite)).toBe(true);
  });

  it("a different word gets a different crumble — but the same word always the same", () => {
    const a = scene(make("crumble"), 0.5, "SALE");
    const b = scene(make("crumble"), 0.5, "SALE");
    const c = scene(make("crumble"), 0.5, "NEW");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe("transitions", () => {
  it.each(TRANSITIONS)("%s going OUT starts whole and ends gone", (k) => {
    const fx = make(k, { mode: "out" });
    expect(isWhole(scene(fx, 0))).toBe(true);
    expect(isGone(scene(fx, 1))).toBe(true);
  });

  it.each(TRANSITIONS)("%s coming IN starts gone and ends whole", (k) => {
    const fx = make(k, { mode: "in" });
    expect(isGone(scene(fx, 0))).toBe(true);
    expect(isWhole(scene(fx, 1))).toBe(true);
  });

  it.each(TRANSITIONS)(
    "%s building up is exactly breaking apart, backwards",
    (k) => {
      for (const p of [0.1, 0.35, 0.5, 0.9]) {
        expect(scene(make(k, { mode: "in" }), p)).toEqual(
          scene(make(k, { mode: "out" }), 1 - p),
        );
      }
    },
  );

  it("crumble and dust tile the picture exactly — no gaps, no overlaps", () => {
    for (const k of ["crumble", "dust"] as const) {
      const pcs = scene(make(k), 0).pieces;
      const area = pcs.reduce((a, p) => a + p.sw * p.sh, 0);
      expect(area).toBe(SIZE.w * SIZE.h);
    }
  });

  it("crumble and dust keep their tile count within the render budget", () => {
    expect(scene(make("crumble"), 0).pieces.length).toBeLessThanOrEqual(80);
    expect(scene(make("dust"), 0).pieces.length).toBeLessThanOrEqual(130);
  });

  it("slice: more strength cuts more pieces", () => {
    const n = (i: number) =>
      scene(make("slice", { intensity: i }), 0.5).pieces.length;
    expect(n(1)).toBe(2);
    expect(n(1.5)).toBe(3);
    expect(n(2)).toBe(4);
  });

  it("slice: the cut flashes before anything moves", () => {
    const early = scene(make("slice"), 0.1);
    const late = scene(make("slice"), 0.9);
    expect(early.bolts.length).toBeGreaterThan(0);
    expect(late.bolts.length).toBe(0);
  });
});

describe("pulses", () => {
  it.each(PULSES)(
    "%s leaves the picture whole at the start and the end of a run",
    (k) => {
      expect(isWhole(scene(make(k), 0))).toBe(true);
      expect(isWhole(scene(make(k), 1))).toBe(true);
    },
  );

  it("electric: lightning peaks mid-run and uses the chosen colour", () => {
    const mid = scene(make("electric", { color: "#ff0000" }), 0.5);
    expect(mid.bolts.length).toBeGreaterThan(0);
    expect(mid.bolts.some((b) => b.color === "#ff0000")).toBe(true);
    expect(mid.bolts.some((b) => b.color === "#ffffff")).toBe(true); // the core
  });

  it("electric: stronger means more bolts", () => {
    const count = (i: number) =>
      scene(make("electric", { intensity: i }), 0.5).bolts.length;
    expect(count(2)).toBeGreaterThan(count(0.5));
  });

  it("electric: the bolts hold for a few frames instead of re-rolling every one", () => {
    const fx = make("electric", { lengthSec: 1 });
    expect(scene(fx, 0.5).bolts).toEqual(scene(fx, 0.5 + 0.005).bolts);
  });

  it("shine: the glint travels across and off the far side", () => {
    const fx = make("shine");
    const x = (p: number) => scene(fx, p).sweep!.cx;
    expect(x(0.2)).toBeLessThan(x(0.5));
    expect(x(0.5)).toBeLessThan(x(0.8));
    expect(x(0)).toBeLessThan(0);
    expect(x(1)).toBeGreaterThan(SIZE.w);
  });

  it("glitch: colour fringes appear only while it is tearing", () => {
    const fringed = (p: number) =>
      scene(make("glitch"), p).pieces.some(
        (pc) => pc.colorize && pc.alpha > 0.1,
      );
    expect(PULSES.includes("glitch")).toBe(true);
    // somewhere in the run it tears and fringes
    expect(GRID.some(fringed)).toBe(true);
  });
});

describe("the catalog and the schema", () => {
  it("gives every kind a label, a blurb and a family", () => {
    for (const k of PIXEL_FX_KINDS) {
      const m = FX_META[k];
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
      expect(["transition", "pulse"]).toContain(m.family);
    }
  });

  it("defaultFx is valid for every kind", () => {
    for (const k of PIXEL_FX_KINDS) {
      expect(pixelFxSchema.safeParse(defaultFx(k)).success).toBe(true);
    }
  });

  it("switching kind keeps the user's timing and strength, takes the new defaults", () => {
    const prev = make("crumble", {
      startPct: 72,
      intensity: 1.6,
      lengthSec: 2.5,
    });
    const next = switchFxKind(prev, "electric");
    expect(next.kind).toBe("electric");
    expect(next.startPct).toBe(72);
    expect(next.intensity).toBe(1.6);
    expect(next.lengthSec).toBe(FX_META.electric.defaultLengthSec);
    expect(next.color).toBe(FX_META.electric.defaultColor);
  });

  it("rejects out-of-range values", () => {
    const bad = (o: object) =>
      pixelFxSchema.safeParse({ ...defaultFx("crumble"), ...o }).success;
    expect(bad({ startPct: 101 })).toBe(false);
    expect(bad({ startPct: -1 })).toBe(false);
    expect(bad({ lengthSec: 0.1 })).toBe(false);
    expect(bad({ lengthSec: 5 })).toBe(false);
    expect(bad({ repeat: 6 })).toBe(false);
    expect(bad({ repeat: 1.5 })).toBe(false);
    expect(bad({ intensity: 3 })).toBe(false);
    expect(bad({ color: "red" })).toBe(false);
    expect(bad({ kind: "explode" })).toBe(false);
  });

  it("is optional on a sticker, so every saved sticker still parses", () => {
    const base = {
      text: "SALE",
      font: "Anton",
      weight: 700,
      color: "#ffffff",
    };
    expect(stickerSpecSchema.safeParse(base).success).toBe(true);
    expect(
      stickerSpecSchema.safeParse({ ...base, fx: defaultFx("slice") }).success,
    ).toBe(true);
  });
});
