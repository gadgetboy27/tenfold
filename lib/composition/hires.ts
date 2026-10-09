import type { CompositionDoc, StickerSpec } from "./layers";

/**
 * Make a doc sharp at a higher render scale.
 *
 * A sticker is a PICTURE, drawn once at a fixed size (lib/composition/sticker.ts)
 * and scaled by the layer's `scale`. The export multiplies that scale for a
 * High render, so a picture that was sharp at 1x is enlarged to 2x and goes
 * soft — while text, drawn by FFmpeg at the output size, stays crisp. The two
 * would sit side by side on the same ad.
 *
 * So for a High render each sticker is drawn again at `k` times the size and its
 * scale divided by `k`. The server then multiplies by `k` as it always does, and
 * lands exactly where it did at 1x — with `k` times the pixels behind it.
 *
 * Applied to the doc that is SENT, never the one on the stage: the stage's own
 * fingerprint (signature.ts) must keep matching, and the editor keeps its
 * normal-size pictures. The rasteriser is passed in because drawing needs a
 * canvas; that keeps this pure and testable.
 */
export type StickerRasterizer = (
  spec: StickerSpec,
  density: number,
) => { dataUrl: string };

export function hiResDoc(
  doc: CompositionDoc,
  k: number,
  rasterize: StickerRasterizer,
): CompositionDoc {
  if (!(k > 1)) return doc;
  const stickerIds = new Set<string>();
  const layers = doc.layers.map((l) => {
    if (l.kind !== "image" || !l.sticker) return l;
    stickerIds.add(l.id);
    return {
      ...l,
      src: rasterize(l.sticker, k).dataUrl,
      scale: l.scale / k,
    };
  });
  if (stickerIds.size === 0) return doc;

  // A per-format size nudge REPLACES the layer's scale (effectiveLayer), so it
  // is in the same units and must shrink with it.
  let overrides = doc.overrides;
  if (overrides) {
    overrides = Object.fromEntries(
      Object.entries(overrides).map(([aspect, byId]) => [
        aspect,
        Object.fromEntries(
          Object.entries(byId ?? {}).map(([id, o]) => [
            id,
            stickerIds.has(id) && typeof o.scale === "number"
              ? { ...o, scale: o.scale / k }
              : o,
          ]),
        ),
      ]),
    ) as CompositionDoc["overrides"];
  }
  return { ...doc, layers, overrides };
}
