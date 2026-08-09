/**
 * Thumbnail URLs for Supabase-hosted images.
 *
 * Generated images are ~875KB each at full resolution. The Gallery fetches up
 * to 300 of them and renders every one at once, which is roughly **262MB** of
 * image data for a grid of postage stamps — browsers stall, connections are
 * dropped, and most tiles simply never appear. That is the "images aren't
 * loading" report; the URLs themselves are fine.
 *
 * Supabase Storage can resize on delivery via `/render/image/`, which takes the
 * same file to ~34KB at 400px — a 96% reduction, verified live. Combined with
 * `loading="lazy"` on the tiles, a gallery view goes from hundreds of megabytes
 * to a few hundred kilobytes of what is actually on screen.
 *
 * This is separate from `next.config.ts`'s `unoptimized: true`. That disables
 * Next's own optimizer (which 400s on Railway); this is Supabase resizing at
 * source, so it works regardless.
 */

/** Only Supabase public-object URLs can be transformed. */
const PUBLIC_OBJECT = "/storage/v1/object/public/";
const RENDER_IMAGE = "/storage/v1/render/image/public/";

export interface ThumbOptions {
  /** Rendered width in px. Pick ~2x the CSS size for retina. */
  width?: number;
  /** 20-100. 70 is visually indistinguishable at thumbnail size. */
  quality?: number;
}

/**
 * A resized variant of a Supabase storage URL, or the original URL unchanged
 * when it isn't one (fal CDN links, uploads, anything external). Never throws
 * and never returns an empty string — a broken thumbnail is worse than a big
 * one.
 */
export function thumbUrl(
  url: string | null | undefined,
  { width = 400, quality = 70 }: ThumbOptions = {},
): string {
  if (!url || !url.includes(PUBLIC_OBJECT)) return url ?? "";
  // Preserve any existing query string rather than clobbering it.
  const [path, existing] = url.split("?");
  const params = new URLSearchParams(existing);
  params.set("width", String(width));
  params.set("quality", String(quality));
  return `${path.replace(PUBLIC_OBJECT, RENDER_IMAGE)}?${params.toString()}`;
}
