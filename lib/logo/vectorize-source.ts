import sharp from "sharp";

/**
 * Recraft vectorize refuses any image under 256px on a side — "One or more
 * images in the zip file are too small. Minimum dimension required is 256
 * pixels." That is exactly the shape of the logo people bring in: a 360×139
 * PNG saved off an old website (rejected 2026-09-13, and again the same way
 * on 2026-09-06). Each time the credit was refunded but the user got an empty
 * screen instead of a logo.
 *
 * Tracing is resolution-tolerant — the vectorizer follows edges, and a clean
 * upscale gives it more edge to follow, not less — so a small source is
 * enlarged rather than bounced. The target is comfortably above the minimum
 * so a near-miss is not re-rejected by a rounding difference on their side.
 */
export const VECTORIZE_MIN_SIDE = 256;
export const VECTORIZE_TARGET_SIDE = 640;

export interface VectorizeSource {
  buffer: Buffer;
  contentType: string;
  /** True when the image was enlarged to clear Recraft's minimum. */
  resized: boolean;
  width: number;
  height: number;
}

export async function fitForVectorize(
  input: Buffer | ArrayBuffer,
  contentType: string,
): Promise<VectorizeSource> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const shortest = Math.min(width, height);
  if (!shortest || shortest >= VECTORIZE_MIN_SIDE) {
    return { buffer, contentType, resized: false, width, height };
  }

  const scale = VECTORIZE_TARGET_SIDE / shortest;
  const out = await sharp(buffer)
    .resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: "lanczos3",
      fit: "fill",
    })
    // PNG keeps the alpha a logo usually has; jpg would flatten it to white.
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    contentType: "image/png",
    resized: true,
    width: out.info.width,
    height: out.info.height,
  };
}
