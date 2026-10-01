/**
 * Which layer sources the server renderer will accept.
 *
 * The renderer fetches http(s) URLs and decodes inline pictures itself
 * (`dataUrlBytes` in export.ts). It can NOT see a blob: URL, which only ever
 * existed in the user's browser tab — those are uploaded first (materializeDoc).
 *
 * Inline pictures matter because stickers, freehand drawings and combined
 * panels are rasterised in the browser and kept as data: URLs. The export
 * route used to demand http(s) for every layer, so any project containing one
 * was refused with "All layer sources must be uploaded before export".
 */
export const MAX_INLINE_BYTES = 12 * 1024 * 1024;

export const isHttpSource = (u: string) => /^https?:\/\//i.test(u);

/** A raster data: URL within the size cap. The check is on the encoded length
 *  (base64 is 4/3 of the bytes) so it is cheap and cannot be fooled by a lie
 *  about size elsewhere. */
export const isInlineRaster = (u: string) =>
  /^data:image\/(png|jpeg|webp);base64,/i.test(u) &&
  u.length <= (MAX_INLINE_BYTES * 4) / 3;

/** True when every source in a doc is something the renderer can read. */
export function sourcesRenderable(
  backgroundSrc: string,
  layerImageSrcs: string[],
  audioUrl?: string | null,
): boolean {
  return (
    isHttpSource(backgroundSrc) &&
    (!audioUrl || isHttpSource(audioUrl)) &&
    layerImageSrcs.every((u) => isHttpSource(u) || isInlineRaster(u))
  );
}
