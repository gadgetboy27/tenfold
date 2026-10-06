import sharp from "sharp";

/**
 * FFmpeg has no SVG decoder: an image layer whose file is a vector (a traced
 * logo, a vectorised mark) fails the whole export with "no decoder found for:
 * svg". The browser preview draws SVG natively, so the ad looked fine and only
 * the render broke. Server only (sharp).
 */

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // WebP

const starts = (b: Buffer, sig: number[]) => sig.every((v, i) => b[i] === v);

/** Is this file an SVG? Sniffs the head, so it doesn't depend on the name or
 *  the declared type — both of which are `.img` / octet-stream by here. */
export function isSvg(bytes: Buffer): boolean {
  if (starts(bytes, PNG) || starts(bytes, JPEG) || starts(bytes, RIFF))
    return false;
  return /<svg[\s>]/i.test(bytes.subarray(0, 2048).toString("utf8"));
}

/**
 * Rasterise at the SVG's own size — the same size the preview's canvas draws it
 * at — with transparency kept. The layer's scale is applied afterwards by the
 * export, exactly as for any other image, so preview and MP4 agree.
 */
export function svgToPng(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).png().toBuffer();
}
