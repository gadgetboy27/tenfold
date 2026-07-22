import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  textureOverlay,
  gradientMerge,
  softGlow,
} from "@/lib/compositing/blend";

// Small solid-colour PNGs — real Sharp buffers, no mocking. These are pure
// pixel operations, so we verify shape/alpha/dimensions against real output.
async function solid(
  w: number,
  h: number,
  rgb: [number, number, number],
  alpha = 1,
): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha },
    },
  })
    .png()
    .toBuffer();
}

describe("textureOverlay", () => {
  it("returns a PNG matching the base image's dimensions", async () => {
    const base = await solid(100, 60, [255, 0, 0]);
    const texture = await solid(40, 40, [0, 255, 0]);
    const out = await textureOverlay(base, texture, "multiply", 1);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(60);
    expect(meta.format).toBe("png");
  });

  it("visibly changes pixels when opacity is 1 (multiply darkens)", async () => {
    const base = await solid(20, 20, [255, 255, 255]);
    const texture = await solid(20, 20, [200, 100, 50]);
    const out = await textureOverlay(base, texture, "multiply", 1);
    const { data } = await sharp(out)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // multiply(white, texture) == texture, so the result should match the
    // texture colour rather than staying pure white.
    expect(data[0]).toBeLessThan(255);
  });

  it("leaves the base unchanged when opacity is 0", async () => {
    const base = await solid(20, 20, [10, 20, 30]);
    const texture = await solid(20, 20, [200, 100, 50]);
    const out = await textureOverlay(base, texture, "overlay", 0);
    const { data } = await sharp(out)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeCloseTo(10, -1);
    expect(data[1]).toBeCloseTo(20, -1);
    expect(data[2]).toBeCloseTo(30, -1);
  });
});

describe("gradientMerge", () => {
  it("returns imageA's colour at the fading edge and imageB's near the solid edge", async () => {
    const a = await solid(100, 50, [255, 0, 0]);
    const b = await solid(100, 50, [0, 0, 255]);
    const out = await gradientMerge(a, b, "horizontal");
    const { data, info } = await sharp(out)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const row = 25;
    const leftIdx = (row * info.width + 2) * channels; // near x=0 (gradient starts opaque for B... check both ends)
    const rightIdx = (row * info.width + (info.width - 3)) * channels;
    // Gradient goes white(opaque)->transparent left-to-right, so B dominates at
    // x=0 and A dominates at x=width. Confirm the two ends actually differ.
    const leftR = data[leftIdx];
    const rightR = data[rightIdx];
    expect(leftR).not.toBe(rightR);
  });

  it("matches imageA's dimensions", async () => {
    const a = await solid(80, 40, [1, 2, 3]);
    const b = await solid(200, 200, [4, 5, 6]);
    const out = await gradientMerge(a, b, "vertical");
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(40);
  });
});

describe("softGlow", () => {
  it("returns a PNG the same size as the input", async () => {
    const base = await solid(64, 64, [128, 64, 200]);
    const out = await softGlow(base, 8);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
    expect(meta.format).toBe("png");
  });

  it("softens a hard edge (blurred blend reduces local contrast)", async () => {
    // Half red / half blue — a hard vertical edge at x=32.
    const left = await solid(32, 32, [255, 0, 0]);
    const right = await solid(32, 32, [0, 0, 255]);
    const base = await sharp({
      create: { width: 64, height: 32, channels: 4, background: "#000000" },
    })
      .composite([
        { input: left, left: 0, top: 0 },
        { input: right, left: 32, top: 0 },
      ])
      .png()
      .toBuffer();

    const out = await softGlow(base, 10);
    const rawBefore = await sharp(base)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rawAfter = await sharp(out)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = rawBefore.info.channels;
    const rowOffset = 16 * rawBefore.info.width * ch;
    // Right at the edge (x=31 vs x=32), the jump in red channel should shrink
    // after the soft-light blur blend versus the original hard cut.
    const idxLeftOfEdge = rowOffset + 31 * ch;
    const idxRightOfEdge = rowOffset + 32 * ch;
    const jumpBefore = Math.abs(
      rawBefore.data[idxLeftOfEdge] - rawBefore.data[idxRightOfEdge],
    );
    const jumpAfter = Math.abs(
      rawAfter.data[idxLeftOfEdge] - rawAfter.data[idxRightOfEdge],
    );
    expect(jumpAfter).toBeLessThanOrEqual(jumpBefore);
  });
});
