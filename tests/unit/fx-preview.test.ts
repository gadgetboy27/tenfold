import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defaultFx } from "@/lib/composition/fx/catalog";
import { fxMargin, fxSceneFor } from "@/lib/composition/fx/effects";
import { motionAt } from "@/lib/composition/effects";
import { drawLayer } from "@/lib/composition/render";
import { imageLayerSchema, type ImageLayer } from "@/lib/composition/layers";
import type { PixelFx } from "@/lib/composition/fx/types";

/**
 * The browser draws an effect from the same scene the server renders, and the
 * preview decides — per moment — whether to draw the plain sticker, the
 * effect, or nothing. There is no DOM in these tests, so canvases are a
 * recording fake: what matters is WHAT is drawn, and in what order.
 */
interface Call {
  fn: string;
  args: unknown[];
}
function fakeCtx(calls: Call[] = []) {
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_t, k: string) {
        if (k in props) return props[k];
        if (k === "createLinearGradient")
          return (...a: unknown[]) => {
            calls.push({ fn: k, args: a });
            return {
              addColorStop: (...s: unknown[]) =>
                calls.push({ fn: "addColorStop", args: s }),
            };
          };
        if (k === "measureText") return () => ({ width: 10 });
        return (...args: unknown[]) => void calls.push({ fn: k, args });
      },
      set(_t, k: string, v) {
        props[k] = v;
        calls.push({ fn: `set:${k}`, args: [v] });
        return true;
      },
    },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, props };
}

interface FakeCanvas {
  width: number;
  height: number;
  ctx: ReturnType<typeof fakeCtx>;
  getContext: () => CanvasRenderingContext2D;
}
const made: FakeCanvas[] = [];
const realDocument = (globalThis as { document?: unknown }).document;

// The renderer keeps its work canvas at module level; a fresh copy per test
// keeps one test's drawing out of the next one's recording.
async function freshDraw() {
  vi.resetModules();
  return (await import("@/lib/composition/fx/canvas")).drawFxScene;
}

beforeEach(() => {
  made.length = 0;
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      const f = fakeCtx();
      const c: FakeCanvas = {
        width: 0,
        height: 0,
        ctx: f,
        getContext: () => f.ctx,
      };
      made.push(c);
      return c;
    },
  };
});
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
});

const SIZE = { w: 620, h: 260 };
const img = {
  complete: true,
  naturalWidth: SIZE.w,
  naturalHeight: SIZE.h,
} as unknown as HTMLImageElement;

describe("drawFxScene", () => {
  it("draws a piece by cutting its rectangle from the source", async () => {
    const drawFxScene = await freshDraw();
    const main = fakeCtx();
    const fx = defaultFx("crumble");
    const scene = fxSceneFor(fx, SIZE, "SALE", 0);
    drawFxScene(
      main.ctx,
      img,
      SIZE,
      fxMargin("crumble", SIZE.w, SIZE.h),
      scene,
    );
    const work = made[0].ctx.calls.filter((c) => c.fn === "drawImage");
    expect(work.length).toBe(scene.pieces.length);
    expect(work[0].args[0]).toBe(img);
    expect(work[0].args).toHaveLength(9); // source rect → destination rect
  });

  it("the work canvas is the picture plus the margin; the result lands centred", async () => {
    const drawFxScene = await freshDraw();
    const main = fakeCtx();
    const m = fxMargin("slice", SIZE.w, SIZE.h);
    drawFxScene(
      main.ctx,
      img,
      SIZE,
      m,
      fxSceneFor(defaultFx("slice"), SIZE, "SALE", 0.5),
    );
    expect(made[0].width).toBe(SIZE.w + m.x * 2);
    expect(made[0].height).toBe(SIZE.h + m.y * 2);
    const out = main.calls.find((c) => c.fn === "drawImage")!;
    expect(out.args[0]).toBe(made[0]);
    expect(out.args[1]).toBe(-(SIZE.w + m.x * 2) / 2);
    expect(out.args[2]).toBe(-(SIZE.h + m.y * 2) / 2);
  });

  it("clips a sliced piece to its polygon before drawing it", async () => {
    const drawFxScene = await freshDraw();
    const main = fakeCtx();
    drawFxScene(
      main.ctx,
      img,
      SIZE,
      fxMargin("slice", SIZE.w, SIZE.h),
      fxSceneFor(defaultFx("slice"), SIZE, "SALE", 0.5),
    );
    const fns = made[0].ctx.calls.map((c) => c.fn);
    expect(fns.indexOf("clip")).toBeGreaterThan(-1);
    expect(fns.indexOf("clip")).toBeLessThan(fns.indexOf("drawImage"));
  });

  it("a glint is laid over the picture only where it is (source-atop)", async () => {
    const drawFxScene = await freshDraw();
    const main = fakeCtx();
    drawFxScene(
      main.ctx,
      img,
      SIZE,
      fxMargin("shine", SIZE.w, SIZE.h),
      fxSceneFor(defaultFx("shine"), SIZE, "SALE", 0.5),
    );
    const ops = made[0].ctx.calls
      .filter((c) => c.fn === "set:globalCompositeOperation")
      .map((c) => c.args[0]);
    expect(ops).toContain("source-atop");
    expect(made[0].ctx.calls.some((c) => c.fn === "createLinearGradient")).toBe(
      true,
    );
  });

  it("lightning is stroked after the picture, round-capped", async () => {
    const drawFxScene = await freshDraw();
    const main = fakeCtx();
    drawFxScene(
      main.ctx,
      img,
      SIZE,
      fxMargin("electric", SIZE.w, SIZE.h),
      fxSceneFor(defaultFx("electric"), SIZE, "SALE", 0.5),
    );
    const fns = made[0].ctx.calls.map((c) => c.fn);
    expect(fns.lastIndexOf("stroke")).toBeGreaterThan(
      fns.lastIndexOf("drawImage"),
    );
    expect(made[0].ctx.props.lineCap).toBe("round");
  });

  it("an additive piece (a glow, a colour fringe) adds rather than covers", async () => {
    const drawFxScene = await freshDraw();
    const main = fakeCtx();
    drawFxScene(
      main.ctx,
      img,
      SIZE,
      fxMargin("electric", SIZE.w, SIZE.h),
      fxSceneFor(defaultFx("electric"), SIZE, "SALE", 0.5),
    );
    const ops = made[0].ctx.calls
      .filter((c) => c.fn === "set:globalCompositeOperation")
      .map((c) => c.args[0]);
    expect(ops).toContain("lighter");
  });

  it("skips a piece that has faded out", async () => {
    const drawFxScene = await freshDraw();
    const main = fakeCtx();
    const scene = fxSceneFor(
      { ...defaultFx("crumble"), mode: "out" },
      SIZE,
      "SALE",
      1,
    );
    drawFxScene(
      main.ctx,
      img,
      SIZE,
      fxMargin("crumble", SIZE.w, SIZE.h),
      scene,
    );
    expect(made[0].ctx.calls.filter((c) => c.fn === "drawImage")).toHaveLength(
      0,
    );
  });
});

const layer = (
  fx: PixelFx | undefined,
  over: Record<string, unknown> = {},
): ImageLayer =>
  imageLayerSchema.parse({
    id: "s1",
    kind: "image",
    src: "https://example.com/sticker.png",
    pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
    sticker: {
      text: "SALE",
      font: "Anton",
      weight: 700,
      color: "#ffffff",
      ...(fx ? { fx } : {}),
    },
    ...over,
  });
const CTX = { W: 1080, H: 1080 };
const images = new Map([["https://example.com/sticker.png", img]]);

describe("motionAt reports where the effect is", () => {
  const fx = { ...defaultFx("crumble"), startPct: 50, lengthSec: 2 }; // 10s clip: 5s–7s
  it("before, active, after", () => {
    expect(motionAt(layer(fx), 1, 10, CTX)?.pixelFx?.phase).toBe("before");
    expect(motionAt(layer(fx), 6, 10, CTX)?.pixelFx?.phase).toBe("active");
    expect(motionAt(layer(fx), 8, 10, CTX)?.pixelFx?.phase).toBe("after");
  });
  it("reports progress through the run", () => {
    expect(motionAt(layer(fx), 6, 10, CTX)?.pixelFx?.progress).toBeCloseTo(
      0.5,
      9,
    );
  });
  it("a sticker without an effect has no pixelFx", () => {
    expect(motionAt(layer(undefined), 6, 10, CTX)?.pixelFx).toBeUndefined();
  });
  it("tracks the clip length the stage reports", () => {
    expect(motionAt(layer(fx), 6, 10, CTX)?.pixelFx?.phase).toBe("active");
    expect(motionAt(layer(fx), 6, 30, CTX)?.pixelFx?.phase).toBe("before");
  });
});

describe("drawLayer: still, effect, or nothing", () => {
  const run = (fx: PixelFx, t: number, clip = 10) => {
    const main = fakeCtx();
    const l = layer(fx);
    drawLayer(main.ctx, l, motionAt(l, t, clip, CTX)!, "1:1", images);
    return main.calls.filter((c) => c.fn === "drawImage");
  };
  const drawsStill = (d: Call[]) => d.some((c) => c.args[0] === img);
  const drawsEffect = (d: Call[]) =>
    d.some(
      (c) => (c.args[0] as FakeCanvas | undefined)?.getContext !== undefined,
    );

  const out = {
    ...defaultFx("crumble"),
    mode: "out" as const,
    startPct: 50,
    lengthSec: 2,
  };
  const inn = { ...out, mode: "in" as const };
  const pulse = { ...defaultFx("electric"), startPct: 50, lengthSec: 2 };

  it("out: the still before, the effect during, nothing after", () => {
    expect(drawsStill(run(out, 1))).toBe(true);
    expect(drawsEffect(run(out, 6))).toBe(true);
    expect(drawsStill(run(out, 6))).toBe(false);
    expect(run(out, 8)).toHaveLength(0);
  });

  it("in: nothing before, the effect during, the still after", () => {
    expect(run(inn, 1)).toHaveLength(0);
    expect(drawsEffect(run(inn, 6))).toBe(true);
    expect(drawsStill(run(inn, 8))).toBe(true);
  });

  it("a pulse: the still on both sides, the effect between", () => {
    expect(drawsStill(run(pulse, 1))).toBe(true);
    expect(drawsEffect(run(pulse, 6))).toBe(true);
    expect(drawsStill(run(pulse, 6))).toBe(false);
    expect(drawsStill(run(pulse, 8))).toBe(true);
  });

  it("with no motion state (arrange mode, Combine, a still post) the sticker is always the plain picture", () => {
    const l = layer(out);
    const main = fakeCtx();
    drawLayer(
      main.ctx,
      l,
      { dx: 0, dy: 0, rotDeg: 0, alpha: 1 },
      "1:1",
      images,
    );
    expect(
      main.calls
        .filter((c) => c.fn === "drawImage")
        .some((c) => c.args[0] === img),
    ).toBe(true);
  });

  it("a sticker with no effect is drawn exactly as before", () => {
    const main = fakeCtx();
    const l = layer(undefined);
    drawLayer(main.ctx, l, motionAt(l, 6, 10, CTX)!, "1:1", images);
    const draws = main.calls.filter((c) => c.fn === "drawImage");
    expect(draws).toHaveLength(1);
    expect(draws[0].args).toEqual([img, -SIZE.w / 2, -SIZE.h / 2]);
  });
});
