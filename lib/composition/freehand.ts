/**
 * Freehand — an actual drawing surface, distinct from Sticker (which styles
 * typed TEXT automatically) and from the styled image generator (which asks
 * a model for a picture). This is the literal thing: pick a brush, draw with
 * the pointer, the strokes become a transparent PNG image layer — same "draw
 * in an isolated space, then place the result on the ad" shape Sticker
 * already uses (lib/composition/sticker.ts), just for arbitrary paths
 * instead of glyphs.
 *
 * Brushes are canvas-2D approximations, same spirit as every other effect in
 * this file's sibling — not physically simulated ink/paint, just a stroke
 * recipe that reads as the material it's named for.
 */

export const BRUSH_TYPES = [
  "fine",
  "ballpoint",
  "marker",
  "housepaint",
] as const;
export type BrushType = (typeof BRUSH_TYPES)[number];

export const BRUSH_LABELS: Record<BrushType, string> = {
  fine: "Fine tip",
  ballpoint: "Ballpoint",
  marker: "Marker",
  housepaint: "House paint",
};

export interface StrokePoint {
  x: number;
  y: number;
}

export interface Stroke {
  points: StrokePoint[];
  color: string;
  brush: BrushType;
  /** Base stroke width in canvas px, before the brush's own multiplier. */
  size: number;
}

/** The canvas both the live drawing surface and the exported raster use — a
 *  fixed authoring resolution, same idea as STICKER_FONT_PX, so a drawing
 *  doesn't come out pixelated once scaled up as a layer on the ad. */
export const FREEHAND_CANVAS_PX = 720;

/** Map a pointer event's client coordinates onto the canvas's own pixel grid
 *  — the element can be displayed smaller than FREEHAND_CANVAS_PX via CSS, so
 *  this is the same "measure the real rect, don't assume 1:1" rule every
 *  other drop/draw surface in this codebase follows. */
export function toCanvasPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): StrokePoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

function setBrushStyle(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  switch (stroke.brush) {
    case "fine":
      ctx.lineWidth = stroke.size * 0.35;
      ctx.globalAlpha = 1;
      break;
    case "ballpoint":
      ctx.lineWidth = stroke.size * 0.5;
      ctx.globalAlpha = 0.92;
      break;
    case "marker":
      ctx.lineWidth = stroke.size * 1.1;
      ctx.globalAlpha = 0.5;
      break;
    case "housepaint":
      ctx.lineWidth = stroke.size * 1.6;
      ctx.globalAlpha = 0.85;
      break;
  }
}

/** One segment, drawn immediately — what the live canvas calls on every
 *  pointer move, so drawing feels instant rather than waiting for the stroke
 *  to finish. House paint adds two faint offset passes to fake bristle
 *  streaks; every other brush is a single stroke pass. */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  from: StrokePoint,
  to: StrokePoint,
  stroke: Stroke,
) {
  setBrushStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  if (stroke.brush === "housepaint") {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular unit vector, offset a fraction of the brush width — two
    // thinner, fainter bristle lines alongside the main stroke.
    const nx = -dy / len;
    const ny = dx / len;
    const offset = stroke.size * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = stroke.size * 0.5;
    for (const d of [-offset, offset]) {
      ctx.beginPath();
      ctx.moveTo(from.x + nx * d, from.y + ny * d);
      ctx.lineTo(to.x + nx * d, to.y + ny * d);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  p: StrokePoint,
  stroke: Stroke,
) {
  setBrushStyle(ctx, stroke);
  ctx.beginPath();
  ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A whole stroke from scratch — used to replay the remaining strokes after
 *  an undo, since the live canvas draws incrementally and has no other way
 *  to "remove" what a popped stroke already painted. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) return;
  if (stroke.points.length === 1) {
    drawDot(ctx, stroke.points[0], stroke);
    return;
  }
  for (let i = 1; i < stroke.points.length; i++) {
    drawSegment(ctx, stroke.points[i - 1], stroke.points[i], stroke);
  }
}

export interface FreehandRaster {
  dataUrl: string;
  width: number;
  height: number;
}

/** Render every stroke onto a fresh transparent canvas and export it as the
 *  PNG that becomes the ad's image layer — mirrors rasterizeSticker's shape
 *  so callers treat the two the same way. */
export function rasterizeFreehand(
  strokes: Stroke[],
  size = FREEHAND_CANVAS_PX,
): FreehandRaster {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  for (const stroke of strokes) drawStroke(ctx, stroke);
  return { dataUrl: canvas.toDataURL("image/png"), width: size, height: size };
}
