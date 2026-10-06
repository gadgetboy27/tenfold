import { describe, it, expect, beforeAll, vi } from "vitest";
import sharp from "sharp";
import {
  fxFrameRate,
  MAX_FX_FRAMES,
  renderFxFrames,
  type FxFrames,
} from "@/lib/composition/fx/frames";
import { defaultFx } from "@/lib/composition/fx/catalog";
import { fxMargin } from "@/lib/composition/fx/effects";
import type { PixelFx, PixelFxKind } from "@/lib/composition/fx/types";

/**
 * The server carries an effect scene out with Sharp. These render a real,
 * small picture — fully opaque or fully clear pixels only, so a piece that
 * hasn't moved must reproduce the source EXACTLY — and check the frames: their
 * size, that each effect starts from the still and ends where it should, and
 * that the glint only ever lands on the lettering.
 */
// These render real frames with Sharp — seconds, not milliseconds.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const W = 120;
const H = 60;
let SRC: Buffer;
let SRC_RAW: Buffer;

beforeAll(async () => {
  // An opaque white bar with a gap, on clear — a stand-in for lettering.
  const bar = await sharp({
    create: { width: 80, height: 22, channels: 4, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const gap = await sharp({
    create: {
      width: 10,
      height: 22,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  SRC = await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: bar, left: 20, top: 19 },
      { input: gap, left: 55, top: 19, blend: "dest-out" },
    ])
    .png()
    .toBuffer();
  SRC_RAW = await sharp(SRC).ensureAlpha().raw().toBuffer();
});

const run = (
  kind: PixelFxKind,
  over: Partial<PixelFx> = {},
): Promise<FxFrames> =>
  renderFxFrames({
    src: SRC,
    fx: { ...defaultFx(kind), lengthSec: 0.5, ...over },
    text: "SALE",
  });

async function raw(png: Buffer) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** The picture-sized window of a frame, i.e. without the effect's margin. */
async function core(png: Buffer, kind: PixelFxKind): Promise<Buffer> {
  const m = fxMargin(kind, W, H);
  return sharp(png)
    .ensureAlpha()
    .extract({ left: m.x, top: m.y, width: W, height: H })
    .raw()
    .toBuffer();
}

const alphaSum = (b: Buffer) => {
  let n = 0;
  for (let i = 3; i < b.length; i += 4) n += b[i];
  return n;
};

describe("frame set", () => {
  it.each(["crumble", "slice", "dust", "electric", "glitch", "shine"] as const)(
    "%s: frames are the picture plus the effect's margin on every side",
    async (kind) => {
      const r = await run(kind);
      const m = fxMargin(kind, W, H);
      expect(r.width).toBe(W + m.x * 2);
      expect(r.height).toBe(H + m.y * 2);
      const first = await raw(r.frames[0]);
      expect([first.w, first.h]).toEqual([r.width, r.height]);
    },
  );

  it("renders length × fps frames", async () => {
    const r = await run("crumble", { lengthSec: 0.5 });
    expect(r.frames.length).toBe(Math.round(0.5 * r.fps));
  });

  it("a repeated pulse renders every run", async () => {
    const one = await run("shine", { repeat: 1 });
    const three = await run("shine", { repeat: 3 });
    expect(three.frames.length).toBeGreaterThan(one.frames.length * 2.5);
  });
});

describe("frame rate stays inside the budget", () => {
  it("a transition is capped lower than a pulse", () => {
    expect(fxFrameRate(defaultFx("crumble"))).toBeLessThanOrEqual(24);
    expect(fxFrameRate(defaultFx("shine"))).toBeLessThanOrEqual(30);
  });
  it("never renders more than the frame budget, however long or repeated", () => {
    for (const kind of ["crumble", "electric"] as const) {
      for (const lengthSec of [0.3, 1, 3]) {
        for (const repeat of [1, 5]) {
          const fx = { ...defaultFx(kind), lengthSec, repeat };
          const total = lengthSec * (kind === "electric" ? repeat : 1);
          expect(Math.round(total * fxFrameRate(fx))).toBeLessThanOrEqual(
            MAX_FX_FRAMES,
          );
        }
      }
    }
  });
});

describe("effects begin from the still, exactly", () => {
  it.each(["crumble", "dust", "electric", "glitch", "shine"] as const)(
    "%s: the first frame is the source, pixel for pixel",
    async (kind) => {
      const r = await run(kind);
      expect((await core(r.frames[0], kind)).equals(SRC_RAW)).toBe(true);
    },
  );

  it("slice: the first frame is the source (the seam is overlapped, not left open)", async () => {
    const r = await run("slice");
    const got = await core(r.frames[0], "slice");
    let worst = 0;
    for (let i = 0; i < got.length; i++)
      worst = Math.max(worst, Math.abs(got[i] - SRC_RAW[i]));
    expect(worst).toBeLessThanOrEqual(2);
  });

  it("nothing is drawn outside the picture on the first frame", async () => {
    const r = await run("crumble");
    const f = await raw(r.frames[0]);
    const inner = await sharp(r.frames[0])
      .ensureAlpha()
      .extract({
        left: fxMargin("crumble", W, H).x,
        top: fxMargin("crumble", W, H).y,
        width: W,
        height: H,
      })
      .raw()
      .toBuffer();
    expect(alphaSum(f.data)).toBe(alphaSum(inner));
  });
});

describe("where transitions end", () => {
  it("going out, the picture has all but gone by the last frame", async () => {
    const r = await run("crumble", { mode: "out" });
    const last = await raw(r.frames[r.frames.length - 1]);
    expect(alphaSum(last.data)).toBeLessThan(alphaSum(SRC_RAW) * 0.15);
  });

  it("coming in, it has all but arrived by the last frame", async () => {
    const r = await run("crumble", { mode: "in" });
    const last = await raw(r.frames[r.frames.length - 1]);
    expect(alphaSum(last.data)).toBeGreaterThan(alphaSum(SRC_RAW) * 0.6);
  });

  it("midway, tiles have left the picture's own area (it really breaks apart)", async () => {
    const r = await run("crumble", { lengthSec: 1 });
    const mid = await raw(r.frames[Math.floor(r.frames.length * 0.7)]);
    const m = fxMargin("crumble", W, H);
    let outside = 0;
    for (let y = 0; y < mid.h; y++) {
      for (let x = 0; x < mid.w; x++) {
        const inPic = x >= m.x && x < m.x + W && y >= m.y && y < m.y + H;
        if (!inPic && mid.data[(y * mid.w + x) * 4 + 3] > 0) outside++;
      }
    }
    expect(outside).toBeGreaterThan(0);
  });
});

describe("the strike and the glint", () => {
  it("lightning reaches beyond the lettering, and is the chosen colour", async () => {
    const r = await run("electric", { color: "#ff0000", lengthSec: 1 });
    const mid = await raw(r.frames[Math.floor(r.frames.length / 2)]);
    const m = fxMargin("electric", W, H);
    let red = 0;
    for (let i = 0; i < mid.data.length; i += 4) {
      if (mid.data[i + 3] > 40 && mid.data[i] > 200 && mid.data[i + 1] < 120)
        red++;
    }
    expect(red).toBeGreaterThan(0);
    expect(m.x).toBeGreaterThan(0);
  });

  it("the glint lights the lettering and never paints the clear space around it", async () => {
    const r = await run("shine", { color: "#ff0000", lengthSec: 1 });
    let changedRgb = false;
    for (const f of r.frames) {
      const c = await core(f, "shine");
      for (let i = 0; i < c.length; i += 4) {
        // alpha is the source's: the glint adds no coverage
        expect(c[i + 3]).toBe(SRC_RAW[i + 3]);
        if (
          c[i + 3] > 0 &&
          (c[i] !== SRC_RAW[i] || c[i + 1] !== SRC_RAW[i + 1])
        )
          changedRgb = true;
      }
    }
    expect(changedRgb).toBe(true);
  });
});
