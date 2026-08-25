import type { BrandKitInfo } from "./brand-apply";

/**
 * Choosing which logo variant to stamp by looking at what it will sit on.
 *
 * `pickKitLogo` picks by AVAILABILITY — `logo_url ?? logo_dark_url` — which is
 * fine when only one variant exists and wrong the moment both do. The white
 * mark exists for dark footage and the black one for light; picking the first
 * non-null puts a white logo on a white product shot often enough to matter.
 *
 * This is measured rather than asked. A model could be shown the image and
 * asked "is this dark?", but that costs a call, takes seconds, and can be
 * wrong — where the answer is literally the average luminance of the pixels the
 * logo will cover. Deterministic beats plausible, same reasoning as the Words
 * tool.
 */

/** Rec. 709 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Which variant reads on a backdrop of this luminance.
 *
 * Falls back to whatever exists when only one variant is stored, so a
 * half-configured brand kit still stamps something rather than nothing.
 */
export function pickContrastingLogo(
  kit: BrandKitInfo,
  backdropLuminance: number | null,
): string | null {
  const light = kit.logo_url ?? null; // white mark, for dark backdrops
  const dark = kit.logo_dark_url ?? null; // black mark, for light backdrops

  if (!light) return dark;
  if (!dark) return light;
  if (backdropLuminance === null) return light;

  // 0.5 is the midpoint; a backdrop brighter than that needs the dark mark.
  return backdropLuminance > 0.5 ? dark : light;
}

/**
 * Average luminance of the region a logo will occupy.
 *
 * Samples only the bottom-right eighth by default, because that is where the
 * end-card mark sits — averaging the whole frame would let a bright sky decide
 * the colour of a logo standing on dark ground.
 *
 * Returns null rather than throwing on any failure (CORS, decode, a canvas the
 * browser refuses to read back). A null means "no opinion", and the caller
 * falls back to the available variant — never blocks the stamp.
 */
export async function sampleBackdropLuminance(
  imageUrl: string,
  region: { x: number; y: number; w: number; h: number } = {
    x: 0.5,
    y: 0.6,
    w: 0.5,
    h: 0.4,
  },
): Promise<number | null> {
  if (typeof document === "undefined") return null;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      // Required or the canvas is tainted and getImageData throws.
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("load failed"));
      el.src = imageUrl;
    });

    // Downscale hard before reading pixels: we want an average, not detail, and
    // a 64px canvas is ~1000x less work than a 2048px one.
    const S = 64;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const sx = img.naturalWidth * region.x;
    const sy = img.naturalHeight * region.y;
    const sw = Math.max(1, img.naturalWidth * region.w);
    const sh = Math.max(1, img.naturalHeight * region.h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, S, S);

    const { data } = ctx.getImageData(0, 0, S, S);
    let total = 0;
    let counted = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Skip transparent pixels — they aren't backdrop, and counting them as
      // black would drag a light frame toward "dark".
      if (data[i + 3] < 16) continue;
      total += relativeLuminance(data[i], data[i + 1], data[i + 2]);
      counted++;
    }
    return counted === 0 ? null : total / counted;
  } catch {
    return null;
  }
}
