import {
  ASPECT_DESIGN,
  blendToCanvas,
  layerAlphaAt,
  type CompositionDoc,
  type Layer,
} from "@/lib/composition/layers";

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
  const m = ctx.measureText(layer.text);
  ctx.restore();
  return { width: m.width, height: layer.sizePx * 1.2 };
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
): void {
  const alpha = layerAlphaAt(layer, t, clipDuration);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = blendToCanvas(layer.blend);
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotationDeg * Math.PI) / 180);
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
    ctx.fillText(layer.text, 0, 0);
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
    drawLayer(ctx, layer, input.t, input.clipDuration, input.images);
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
