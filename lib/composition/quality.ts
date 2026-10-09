import { ASPECT_DESIGN, type CompositionAspect } from "./layers";

/**
 * Render quality — the output resolution multiplier, in one place.
 *
 * Two levels, not three. Social platforms recompress to about 1080p, so
 * Standard is what almost every post needs; High (2×, 4K-class) is for print,
 * websites and YouTube. A third level (3×) was accepted by the API but never
 * offered, costs nine times the pixels of Standard, and has no audience — so
 * it is gone, and the server refuses it.
 */
export const RENDER_SCALES = [1, 2] as const;
export type RenderScale = (typeof RENDER_SCALES)[number];

export const isRenderScale = (n: unknown): n is RenderScale =>
  n === 1 || n === 2;

/** Rendering above Standard costs real server time, so it is a plan feature
 *  (`hdExport`) — the same entitlement the single-image HD upscale uses. */
export const needsHdPlan = (scale: number): boolean => scale > 1;

export function outputSize(
  aspect: CompositionAspect,
  scale: RenderScale,
): { width: number; height: number } {
  const d = ASPECT_DESIGN[aspect];
  return { width: d.width * scale, height: d.height * scale };
}

export function sizeLabel(
  aspect: CompositionAspect,
  scale: RenderScale,
): string {
  const { width, height } = outputSize(aspect, scale);
  return `${width}×${height}`;
}
