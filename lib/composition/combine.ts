import {
  ASPECT_DESIGN,
  type CompositionAspect,
  type Layer,
} from "@/lib/composition/layers";
import { drawLayer, layerCenter, scaledHalfExtents } from "./render";
import { ensureBrandFontsLoaded } from "./fonts";

/**
 * "Combine into one panel" — take several independently-styled layers (a
 * sticker, a freehand drawing, an added image, each built separately with
 * its own font/size/style) and flatten them into ONE image layer that then
 * drags/resizes/rotates as a single object, the way a finished banner would.
 *
 * Deliberately reuses `drawLayer` (lib/composition/render.ts) — the exact
 * function the live canvas paints every layer with — rather than
 * reimplementing position/rotation/scale math here. A second, parallel
 * geometry implementation is exactly the kind of thing that quietly drifts
 * out of sync the first time the real renderer changes; calling the real
 * one means this can't drift by construction.
 *
 * One-way on purpose (this is Option A, not a live/reversible group): the
 * result is a flattened picture, and the source layers are gone. Nothing
 * here tries to make it un-combinable later.
 */

export interface CombineResult {
  dataUrl: string;
  width: number;
  height: number;
  /** Fractional centre within the ORIGINAL full design canvas — where the
   *  new combined layer's `pos` should point so it lands exactly where the
   *  source layers were, not recentred on the ad. */
  nx: number;
  ny: number;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

export async function combineLayersToImage(
  layers: Layer[],
  aspect: CompositionAspect,
): Promise<CombineResult> {
  if (layers.length < 2) {
    throw new Error("Pick at least two layers to combine");
  }

  await ensureBrandFontsLoaded();

  // A throwaway canvas purely for measuring text (layerCenter/scaledHalfExtents
  // need a 2D context to call ctx.measureText) — never drawn to.
  const measure = document.createElement("canvas").getContext("2d")!;

  const images = new Map<string, HTMLImageElement>();
  for (const layer of layers) {
    if (layer.kind === "image" && !images.has(layer.src)) {
      images.set(layer.src, await loadImage(layer.src));
    }
  }

  // Union of every selected layer's bounding box, in the FULL design canvas's
  // own pixel coordinates — this is the frame the combined image will be
  // cropped to.
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const layer of layers) {
    const c = layerCenter(measure, layer, aspect, images);
    const { halfW, halfH } = scaledHalfExtents(measure, layer, images);
    left = Math.min(left, c.x - halfW);
    top = Math.min(top, c.y - halfH);
    right = Math.max(right, c.x + halfW);
    bottom = Math.max(bottom, c.y + halfH);
  }
  const width = Math.max(1, Math.round(right - left));
  const height = Math.max(1, Math.round(bottom - top));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Every layer draws itself at its own absolute design-space position;
  // offsetting the whole context by the bounding box's origin is what maps
  // that onto this smaller, cropped canvas instead of the full ad frame.
  ctx.save();
  ctx.translate(-left, -top);
  for (const layer of layers) {
    // A flattened panel shows each piece at rest — full opacity, no
    // entrance/exit motion — not whatever moment of an animation happened to
    // be showing when Combine was clicked.
    drawLayer(
      ctx,
      layer,
      { dx: 0, dy: 0, rotDeg: 0, alpha: layer.opacity },
      aspect,
      images,
    );
  }
  ctx.restore();

  const design = ASPECT_DESIGN[aspect];
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
    nx: (left + width / 2) / design.width,
    ny: (top + height / 2) / design.height,
  };
}
