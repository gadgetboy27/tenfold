import sharp from "sharp";

/**
 * Mechanical blends — pure server-side Sharp composites. No fal, no AI, no
 * credits. These are deterministic pixel operations (the "free tier" of the
 * compositing module). Each takes raw image Buffers and returns a PNG Buffer so
 * alpha is preserved through a pipeline; the caller uploads via storeCompositeAsset.
 */

export type OverlayBlendMode = "overlay" | "soft-light" | "multiply";
export type GradientDirection = "horizontal" | "vertical";

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Longest-lived dimensions come from the base image; overlays resize to fit. */
async function dimsOf(buffer: Buffer): Promise<{ w: number; h: number }> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Image has no dimensions");
  return { w: meta.width, h: meta.height };
}

/**
 * Lay a texture over a base at the given blend mode + opacity. The texture is
 * resized to cover the base. Opacity is applied as a uniform alpha (0–1).
 */
export async function textureOverlay(
  base: Buffer,
  texture: Buffer,
  mode: OverlayBlendMode,
  opacity: number,
): Promise<Buffer> {
  const { w, h } = await dimsOf(base);
  let tex = sharp(texture).resize(w, h, { fit: "cover" });
  const a = clamp01(opacity);
  if (a < 1) {
    // Force a uniform alpha regardless of the texture's own alpha channel.
    tex = tex.removeAlpha().ensureAlpha(a);
  }
  const texBuf = await tex.png().toBuffer();
  return sharp(base)
    .composite([{ input: texBuf, blend: mode }])
    .png()
    .toBuffer();
}

/** A white→transparent linear gradient mask as SVG (alpha carries the blend). */
function gradientMaskSvg(w: number, h: number, dir: GradientDirection): Buffer {
  const [x2, y2] = dir === "horizontal" ? [w, 0] : [0, h];
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="white" stop-opacity="1"/>
        <stop offset="1" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Merge two images along a linear alpha gradient — imageA shows on the fading
 * side, imageB on the solid side. Both are resized to A's dimensions.
 */
export async function gradientMerge(
  imageA: Buffer,
  imageB: Buffer,
  direction: GradientDirection,
): Promise<Buffer> {
  const { w, h } = await dimsOf(imageA);
  const bResized = await sharp(imageB)
    .resize(w, h, { fit: "cover" })
    .ensureAlpha()
    .png()
    .toBuffer();
  // dest-in keeps B where the mask is opaque, fading it out along the gradient.
  const bMasked = await sharp(bResized)
    .composite([{ input: gradientMaskSvg(w, h, direction), blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(imageA)
    .resize(w, h, { fit: "cover" })
    .composite([{ input: bMasked, blend: "over" }])
    .png()
    .toBuffer();
}

/**
 * Soft glow — a blurred copy of the base composited back at soft-light, for a
 * dreamy diffusion bloom. `sigma` controls the blur radius.
 */
export async function softGlow(base: Buffer, sigma = 12): Promise<Buffer> {
  const blurred = await sharp(base).blur(Math.max(0.3, sigma)).toBuffer();
  return sharp(base)
    .composite([{ input: blurred, blend: "soft-light" }])
    .png()
    .toBuffer();
}
