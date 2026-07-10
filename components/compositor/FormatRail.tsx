"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  ASPECT_DESIGN,
  resolveCenter,
  type CompositionAspect,
  type CompositionDoc,
} from "@/lib/composition/layers";
import { drawFrame, layerBounds } from "@/lib/composition/render";
import {
  formatWarnings,
  type NormRect,
  type RailFormat,
  type SafeZone,
} from "@/lib/composition/formats";
import { ensureBrandFontsLoaded } from "@/lib/composition/fonts";

/** Longest edge of a thumbnail's canvas buffer (px). The buffer is design-sized
 *  down by a uniform scale, so drawFrame keeps working in design coordinates. */
const THUMB_MAX = 240;

interface Props {
  doc: CompositionDoc;
  /** One item per connected platform (or the generic aspect trio in lab mode). */
  formats: RailFormat[];
  /** The aspect the main canvas is currently editing — highlights its thumbnails. */
  activeAspect: CompositionAspect;
  /** Clicking a thumbnail makes the main canvas edit that aspect. */
  onPick: (aspect: CompositionAspect) => void;
}

/**
 * The multi-format preview rail (docs/multiformat-manifesto.md Phase 3): a row
 * of live thumbnails, one per connected platform, each rendering the SAME master
 * doc reflowed to that platform's aspect via the shared drawFrame. Safe-zone
 * guides overlay each thumbnail and a ⚠ badge lights when a layer lands under
 * the platform's UI chrome. Redraws whenever the doc or media changes, so it
 * mirrors edits live. Read-only preview — clicking switches the main aspect.
 */
export function FormatRail({ doc, formats, activeAspect, onPick }: Props) {
  const canvasEls = useRef(new Map<string, HTMLCanvasElement>());
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const [mediaTick, setMediaTick] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [warnings, setWarnings] = useState<Record<string, SafeZone[]>>({});

  const isVideo = doc.background.kind === "video";
  const bgSrc = doc.background.src;
  const duration = doc.background.durationSec ?? 10;
  const bump = () => setMediaTick((n) => n + 1);

  useEffect(() => {
    ensureBrandFontsLoaded().then(() => setFontsReady(true));
  }, []);

  // Load the background: an <img> for image backgrounds; the hidden <video>
  // below is seeked to its first frame for video backgrounds.
  useEffect(() => {
    if (isVideo || !bgSrc) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = bump;
    img.src = bgSrc;
    bgImageRef.current = img;
  }, [bgSrc, isVideo]);

  // Cache each layer image (drawImage only — never through a model).
  useEffect(() => {
    const cache = imagesRef.current;
    for (const layer of doc.layers) {
      if (layer.kind === "image" && !cache.has(layer.src)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = bump;
        img.src = layer.src;
        cache.set(layer.src, img);
      }
    }
  }, [doc.layers]);

  // Redraw every thumbnail whenever the doc, media, or fonts change — thumbnails
  // are static previews, so a redraw-on-change beats a 60fps loop across N canvases.
  useEffect(() => {
    const v = videoRef.current;
    const background: HTMLVideoElement | HTMLImageElement | null = isVideo
      ? v && v.readyState >= 2
        ? v
        : null
      : bgImageRef.current;

    for (const fmt of formats) {
      const canvas = canvasEls.current.get(fmt.key);
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) continue;

      const design = ASPECT_DESIGN[fmt.aspect];
      const scale = THUMB_MAX / Math.max(design.width, design.height);
      const cw = Math.round(design.width * scale);
      const ch = Math.round(design.height * scale);
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;

      // Draw in design coordinates, scaled into the small buffer.
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawFrame(ctx, {
        // Same master, reflowed to this format's aspect (overrides are Phase 4).
        doc: { ...doc, aspect: fmt.aspect },
        t: 0,
        clipDuration: duration,
        background,
        images: imagesRef.current,
        selectedLayerId: null,
        paused: true, // arrange view: show every layer at its rest position
        draggingLayerId: null,
      });

      // Faint guides for the platform's UI-chrome zones.
      for (const z of fmt.safeZones) {
        ctx.save();
        ctx.fillStyle = "rgba(248,113,113,0.10)";
        ctx.strokeStyle = "rgba(248,113,113,0.45)";
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([6 / scale, 5 / scale]);
        const zx = z.x * design.width;
        const zy = z.y * design.height;
        const zw = z.w * design.width;
        const zh = z.h * design.height;
        ctx.fillRect(zx, zy, zw, zh);
        ctx.strokeRect(zx, zy, zw, zh);
        ctx.restore();
      }
    }
  }, [doc, formats, duration, mediaTick, fontsReady, isVideo]);

  // Compute ⚠ flags off the render path (needs text measurement, so an offscreen
  // ctx). Recomputes when the layout or loaded media changes.
  useEffect(() => {
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe) return;
    const next: Record<string, SafeZone[]> = {};
    for (const fmt of formats) {
      if (fmt.safeZones.length === 0) {
        next[fmt.key] = [];
        continue;
      }
      const design = ASPECT_DESIGN[fmt.aspect];
      const boxes: NormRect[] = doc.layers.map((layer) => {
        const b = layerBounds(probe, layer, imagesRef.current);
        const halfW = (b.width * layer.scale) / 2;
        const halfH = (b.height * layer.scale) / 2;
        const c = resolveCenter(layer.pos, fmt.aspect, halfW, halfH);
        return {
          x: (c.x - halfW) / design.width,
          y: (c.y - halfH) / design.height,
          w: (2 * halfW) / design.width,
          h: (2 * halfH) / design.height,
        };
      });
      next[fmt.key] = formatWarnings(boxes, fmt.safeZones);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- warnings need offscreen text measurement, computed off the render path
    setWarnings(next);
  }, [doc, formats, mediaTick, fontsReady]);

  if (formats.length === 0) return null;

  return (
    <div className="flex shrink-0 items-stretch gap-2 overflow-x-auto pb-1">
      {isVideo && (
        <video
          ref={videoRef}
          src={bgSrc}
          crossOrigin="anonymous"
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            // First frame is enough for a layout preview.
            e.currentTarget.currentTime = 0;
          }}
          onLoadedData={bump}
          onSeeked={bump}
          className="hidden"
        />
      )}
      {formats.map((fmt) => {
        const active = fmt.aspect === activeAspect;
        const zones = warnings[fmt.key] ?? [];
        const flagged = zones.length > 0;
        return (
          <button
            key={fmt.key}
            onClick={() => onPick(fmt.aspect)}
            title={
              flagged
                ? `Heads up — content sits under: ${zones
                    .map((z) => z.label)
                    .join(", ")}`
                : `${fmt.label} (${fmt.aspect})`
            }
            className={`group relative flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors ${
              active
                ? "border-primary/60 bg-primary/10"
                : "border-border hover:border-primary/40"
            }`}
          >
            <div className="flex h-16 items-center justify-center">
              <canvas
                ref={(el) => {
                  if (el) canvasEls.current.set(fmt.key, el);
                  else canvasEls.current.delete(fmt.key);
                }}
                className="max-h-16 rounded border border-black/40 bg-black"
              />
            </div>
            <span
              className={`max-w-[72px] truncate text-[10px] ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {fmt.label}
            </span>
            {flagged && (
              <span className="absolute right-0.5 top-0.5 rounded-full bg-amber-500/90 p-0.5 text-black">
                <AlertTriangle className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
