import {
  ASPECT_DESIGN,
  blendToCanvas,
  type CompositionDoc,
  type Layer,
} from "@/lib/composition/layers";
import { motionAt, type EffectCtx } from "@/lib/composition/effects";

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

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  t: number,
  clipDuration: number,
  images: Map<string, HTMLImageElement>,
  effectCtx: EffectCtx,
): void {
  // Entrance/exit/ambient effects share one motion function with the FFmpeg
  // export (lib/composition/effects.ts) — preview and MP4 stay identical.
  const motion = motionAt(layer, t, clipDuration, effectCtx);
  if (!motion || motion.alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = motion.alpha;
  ctx.globalCompositeOperation = blendToCanvas(layer.blend);
  ctx.translate(layer.x + motion.dx, layer.y + motion.dy);
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

  for (const layer of input.doc.layers) {
    drawLayer(ctx, layer, input.t, input.clipDuration, input.images, {
      W: width,
      H: height,
    });
  }

  const selected = input.doc.layers.find((l) => l.id === input.selectedLayerId);
  if (selected) drawSelectionOutline(ctx, selected, input.images);
}

function drawSelectionOutline(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  images: Map<string, HTMLImageElement>,
): void {
  const b = layerBounds(ctx, layer, images);
  ctx.save();
  ctx.translate(layer.x, layer.y);
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
    const layer = doc.layers[i];
    const b = layerBounds(ctx, layer, images);
    const halfW = (b.width * layer.scale) / 2;
    const halfH = (b.height * layer.scale) / 2;
    if (
      x >= layer.x - halfW &&
      x <= layer.x + halfW &&
      y >= layer.y - halfH &&
      y <= layer.y + halfH
    ) {
      return layer;
    }
  }
  return null;
}
