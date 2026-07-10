import {
  ASPECT_DESIGN,
  blendToCanvas,
  effectiveLayer,
  resolveCenter,
  rotatedHalfExtents,
  type CompositionAspect,
  type CompositionDoc,
  type Layer,
} from "@/lib/composition/layers";
import {
  motionAt,
  type EffectCtx,
  type Motion,
} from "@/lib/composition/effects";

/**
 * Pure canvas drawing + hit-testing for the compositor preview. All maths is
 * in design-space pixels (ASPECT_DESIGN) — the <canvas> buffer is created at
 * design resolution and CSS-scaled to fit, so these functions never care about
 * display size.
 */

export interface LayerBounds {
  width: number;
  height: number;
}

/** Line height multiplier shared with the FFmpeg export (line_spacing). */
export const TEXT_LINE_HEIGHT = 1.25;

/** Natural (unscaled) size of a layer's content in design pixels. */
export function layerBounds(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  images: Map<string, HTMLImageElement>,
): LayerBounds {
  if (layer.kind === "image") {
    const img = images.get(layer.src);
    return {
      width: img?.naturalWidth || 200,
      height: img?.naturalHeight || 200,
    };
  }
  ctx.save();
  ctx.font = `${layer.sizePx}px "${layer.font}", sans-serif`;
  const lines = layer.text.split("\n");
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
  ctx.restore();
  return { width, height: lines.length * layer.sizePx * TEXT_LINE_HEIGHT };
}

/** Cover-fit a source rectangle into the design space (like CSS object-cover). */
export function coverRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (dstW - width) / 2, y: (dstH - height) / 2, width, height };
}

/**
 * Scaled half-size used for anchoring & hit-testing. Images are anchored by
 * their ROTATED bounding box (matching FFmpeg's rotate-expanded overlay on
 * export); text isn't rotated on export (drawtext limitation), so it stays
 * unrotated — keeping preview and MP4 in lockstep for anchored, rotated layers.
 */
export function scaledHalfExtents(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  images: Map<string, HTMLImageElement>,
): { halfW: number; halfH: number } {
  const b = layerBounds(ctx, layer, images);
  const halfW = (b.width * layer.scale) / 2;
  const halfH = (b.height * layer.scale) / 2;
  return layer.kind === "image"
    ? rotatedHalfExtents(halfW, halfH, layer.rotationDeg)
    : { halfW, halfH };
}

/** Design-space centre of a layer for the given aspect (resolves its pos). */
export function layerCenter(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  aspect: CompositionAspect,
  images: Map<string, HTMLImageElement>,
): { x: number; y: number } {
  const { halfW, halfH } = scaledHalfExtents(ctx, layer, images);
  return resolveCenter(layer.pos, aspect, halfW, halfH);
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  motion: Motion,
  aspect: CompositionAspect,
  images: Map<string, HTMLImageElement>,
): void {
  if (motion.alpha <= 0) return;

  const c = layerCenter(ctx, layer, aspect, images);
  ctx.save();
  ctx.globalAlpha = motion.alpha;
  ctx.globalCompositeOperation = blendToCanvas(layer.blend);
  ctx.translate(c.x + motion.dx, c.y + motion.dy);
  ctx.rotate(((layer.rotationDeg + motion.rotDeg) * Math.PI) / 180);
  ctx.scale(layer.scale, layer.scale);

  if (layer.kind === "image") {
    const img = images.get(layer.src);
    // drawImage only — brand assets are never re-rendered by a model.
    if (img?.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    }
  } else {
    ctx.font = `${layer.sizePx}px "${layer.font}", sans-serif`;
    ctx.fillStyle = layer.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Multi-line: centre the block on the anchor, one line per \n.
    const lines = layer.text.split("\n");
    const lineHeight = layer.sizePx * TEXT_LINE_HEIGHT;
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight);
    });
  }
  ctx.restore();
}

export interface DrawFrameInput {
  doc: CompositionDoc;
  t: number;
  clipDuration: number;
  background: HTMLVideoElement | HTMLImageElement | null;
  images: Map<string, HTMLImageElement>;
  selectedLayerId: string | null;
  /** Paused = arrange mode: timing-hidden layers ghost in as placeholders so
   *  everything can be spaced together; playing shows true timing. */
  paused: boolean;
  /** Layer currently being dragged (keeps its outline visible). */
  draggingLayerId: string | null;
  /** Text layer being edited inline — the DOM textarea replaces it, so the
   *  canvas skips drawing it to avoid a double image. */
  editingLayerId?: string | null;
  /** Show the selected layer's outline regardless of ghosting (edge hover /
   *  resize feedback). Still paused-only. */
  forceOutline?: boolean;
}

/** True when the layer's TIMING envelope hides it at t — independent of the
 *  user's opacity setting, so a low opacity slider is never mistaken for
 *  "hidden by schedule" (that made opacity edits look broken). */
function timingHidden(motion: Motion | null, opacity: number): boolean {
  if (!motion) return true;
  const envelope = opacity > 0 ? motion.alpha / opacity : motion.alpha;
  return envelope <= 0.08;
}

/** Draw one full frame: background (cover-fit) then layers back-to-front. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  input: DrawFrameInput,
): void {
  const { width, height } = ASPECT_DESIGN[input.doc.aspect];
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const bg = input.background;
  if (bg) {
    const srcW =
      bg instanceof HTMLVideoElement ? bg.videoWidth : bg.naturalWidth;
    const srcH =
      bg instanceof HTMLVideoElement ? bg.videoHeight : bg.naturalHeight;
    if (srcW > 0 && srcH > 0) {
      const r = coverRect(srcW, srcH, width, height);
      ctx.drawImage(bg, r.x, r.y, r.width, r.height);
    }
  }

  const effectCtx: EffectCtx = { W: width, H: height };
  let selectedGhosted = false;

  for (const master of input.doc.layers) {
    if (master.id === input.editingLayerId) continue; // DOM textarea covers it
    // Apply this aspect's per-format nudges before drawing.
    const layer = effectiveLayer(master, input.doc.aspect, input.doc.overrides);
    // Effects share one motion function with the FFmpeg export
    // (lib/composition/effects.ts) — preview and MP4 stay identical.
    const motion = motionAt(layer, input.t, input.clipDuration, effectCtx);
    const hidden = timingHidden(motion, layer.opacity);
    const isSelected = master.id === input.selectedLayerId;

    if (!hidden && motion) {
      drawLayer(ctx, layer, motion, input.doc.aspect, input.images);
    } else if (input.paused) {
      // Arrange mode: draw the scheduled-away layer as a placeholder ghost
      // at its rest position (preview only — the export honours timing).
      drawLayer(
        ctx,
        layer,
        { dx: 0, dy: 0, rotDeg: 0, alpha: isSelected ? 0.45 : 0.25 },
        input.doc.aspect,
        input.images,
      );
      if (isSelected) selectedGhosted = true;
    } else if (isSelected) {
      selectedGhosted = true;
    }
  }

  // The dashed box marks placeholder spots only — a ghosted selection or an
  // active drag, and only while paused. Playback and finished content stay
  // completely clean.
  const selected = input.doc.layers.find((l) => l.id === input.selectedLayerId);
  const dragging = input.draggingLayerId === input.selectedLayerId;
  if (
    input.paused &&
    selected &&
    selected.id !== input.editingLayerId &&
    (selectedGhosted || dragging || input.forceOutline)
  ) {
    drawSelectionOutline(
      ctx,
      effectiveLayer(selected, input.doc.aspect, input.doc.overrides),
      input.doc.aspect,
      input.images,
    );
  }
}

function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  aspect: CompositionAspect,
  images: Map<string, HTMLImageElement>,
): void {
  const b = layerBounds(ctx, layer, images);
  const c = layerCenter(ctx, layer, aspect, images);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate((layer.rotationDeg * Math.PI) / 180);
  ctx.strokeStyle = "#818cf8";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(
    (-b.width * layer.scale) / 2 - 8,
    (-b.height * layer.scale) / 2 - 8,
    b.width * layer.scale + 16,
    b.height * layer.scale + 16,
  );
  ctx.restore();
}

/**
 * Topmost layer whose bounding box contains the design-space point, or null.
 * Rotation is ignored in the hit test (v1) — close enough for drag targets.
 */
export function hitTestLayer(
  ctx: CanvasRenderingContext2D,
  doc: CompositionDoc,
  x: number,
  y: number,
  images: Map<string, HTMLImageElement>,
): Layer | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const master = doc.layers[i];
    // Hit-test the box as it renders in this aspect (overrides applied)…
    const layer = effectiveLayer(master, doc.aspect, doc.overrides);
    const { halfW, halfH } = scaledHalfExtents(ctx, layer, images);
    const c = resolveCenter(layer.pos, doc.aspect, halfW, halfH);
    if (
      x >= c.x - halfW &&
      x <= c.x + halfW &&
      y >= c.y - halfH &&
      y <= c.y + halfH
    ) {
      return master; // …but return the master so selection edits target it by id
    }
  }
  return null;
}
