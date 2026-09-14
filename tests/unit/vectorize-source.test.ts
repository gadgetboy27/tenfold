import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  fitForVectorize,
  VECTORIZE_MIN_SIDE,
  VECTORIZE_TARGET_SIDE,
} from "@/lib/logo/vectorize-source";

/**
 * Recraft vectorize rejects anything under 256px a side. The logo that hit
 * this in production was 360×139 — an ordinary website header PNG. Small
 * sources are enlarged, large ones are left untouched byte-for-byte.
 */
async function png(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

describe("fitForVectorize", () => {
  it("enlarges a 360×139 logo past Recraft's minimum, keeping its aspect", async () => {
    const out = await fitForVectorize(await png(360, 139), "image/png");
    expect(out.resized).toBe(true);
    expect(out.height).toBe(VECTORIZE_TARGET_SIDE);
    expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(
      VECTORIZE_MIN_SIDE,
    );
    expect(out.width / out.height).toBeCloseTo(360 / 139, 1);
    expect(out.contentType).toBe("image/png");
    const meta = await sharp(out.buffer).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it("passes a large source through unchanged", async () => {
    const src = await png(1024, 1024);
    const out = await fitForVectorize(src, "image/png");
    expect(out.resized).toBe(false);
    expect(out.buffer).toBe(src);
    expect(out.contentType).toBe("image/png");
  });

  it("accepts an ArrayBuffer, as the route gets from FormData", async () => {
    const src = await png(200, 200);
    const ab = new Uint8Array(src).buffer as ArrayBuffer;
    const out = await fitForVectorize(ab, "image/png");
    expect(out.resized).toBe(true);
    expect(out.width).toBe(VECTORIZE_TARGET_SIDE);
  });
});
