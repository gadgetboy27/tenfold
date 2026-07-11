"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import {
  ASPECT_DESIGN,
  effectiveLayer,
  resolveCenter,
  type CompositionAspect,
  type CompositionDoc,
} from "@/lib/composition/layers";
import { drawFrame, scaledHalfExtents } from "@/lib/composition/render";
import {
  formatWarnings,
  isPlatformId,
  PLATFORM_DURATION,
  type NormRect,
  type RailFormat,
  type SafeZone,
} from "@/lib/composition/formats";
import {
  adjustmentsToOverrides,
  type AutofixAdjustment,
  type AutofixLayer,
} from "@/lib/composition/autofix";
import { ensureBrandFontsLoaded } from "@/lib/composition/fonts";
import { useCompositorStore } from "@/store/useCompositorStore";

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
  /** Campaign context — required for the credit-costing vision auto-fix. */
  campaignId?: string | null;
  workspaceSlug?: string;
}

/**
 * The multi-format preview rail (docs/multiformat-manifesto.md Phase 3): a row
 * of live thumbnails, one per connected platform, each rendering the SAME master
 * doc reflowed to that platform's aspect via the shared drawFrame. Safe-zone
 * guides overlay each thumbnail and a ⚠ badge lights when a layer lands under
 * the platform's UI chrome. Redraws whenever the doc or media changes, so it
 * mirrors edits live. Read-only preview — clicking switches the main aspect.
 */
export function FormatRail({
  doc,
  formats,
  activeAspect,
  onPick,
  campaignId,
  workspaceSlug,
}: Props) {
  const canvasEls = useRef(new Map<string, HTMLCanvasElement>());
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const [mediaTick, setMediaTick] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [warnings, setWarnings] = useState<Record<string, SafeZone[]>>({});
  const [fixing, setFixing] = useState<string | null>(null);
  // Synchronous guard: state disables the button only after a re-render, so a
  // rapid double-click could otherwise fire two charged requests.
  const fixingRef = useRef(false);
  const setFormatOverrides = useCompositorStore((s) => s.setFormatOverrides);

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
      const boxes: NormRect[] = doc.layers.map((master) => {
        const layer = effectiveLayer(master, fmt.aspect, doc.overrides);
        // Rotated footprint (matches the exported overlay) so the ⚠ box
        // reflects what actually lands under the chrome.
        const { halfW, halfH } = scaledHalfExtents(
          probe,
          layer,
          imagesRef.current,
        );
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
  // 0 when unknown, so a missing duration never false-flags "too long".
  const clipDuration = doc.background.durationSec ?? 0;

  // Vision auto-fix (Phase 6): send this format's rendered thumbnail + its safe
  // zones + layer positions to Claude, apply the proposed nudges as per-format
  // overrides. Costs credits; campaign-only.
  const runAutofix = async (fmt: RailFormat) => {
    if (!campaignId) {
      toast.error("Open from a campaign to use auto-fix.");
      return;
    }
    const canvas = canvasEls.current.get(fmt.key);
    const probe = document.createElement("canvas").getContext("2d");
    if (!canvas || !probe || fixingRef.current) return;
    fixingRef.current = true;
    setFixing(fmt.key);
    try {
      const image = canvas.toDataURL("image/png");
      const design = ASPECT_DESIGN[fmt.aspect];
      const layers: AutofixLayer[] = [];
      const currentScale: Record<string, number> = {};
      for (const master of doc.layers) {
        const layer = effectiveLayer(master, fmt.aspect, doc.overrides);
        const { halfW, halfH } = scaledHalfExtents(
          probe,
          layer,
          imagesRef.current,
        );
        const c = resolveCenter(layer.pos, fmt.aspect, halfW, halfH);
        layers.push({
          id: master.id,
          kind: master.kind,
          text: master.kind === "text" ? master.text : undefined,
          nx: c.x / design.width,
          ny: c.y / design.height,
          hw: halfW / design.width,
          hh: halfH / design.height,
        });
        currentScale[master.id] = layer.scale;
      }
      const res = await api("/api/compositions/autofix", {
        method: "POST",
        body: JSON.stringify({
          campaignId,
          aspect: fmt.aspect,
          platformLabel: fmt.label,
          image,
          layers,
          zones: fmt.safeZones,
        }),
        workspaceSlug,
      });
      if (res.status === 402) {
        toast.error("Not enough credits for auto-fix.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        adjustments?: AutofixAdjustment[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Auto-fix failed");
      const overrides = adjustmentsToOverrides(
        data.adjustments ?? [],
        currentScale,
      );
      if (Object.keys(overrides).length === 0) {
        toast("This format already looks good.");
        return;
      }
      setFormatOverrides(fmt.aspect, overrides);
      toast.success(`Auto-fixed ${fmt.label}.`);
    } catch (err) {
      toast.error((err as Error).message ?? "Auto-fix failed");
    } finally {
      fixingRef.current = false;
      setFixing(null);
    }
  };

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
        // Duration overflow: the clip runs longer than this platform's cap.
        const cap = isPlatformId(fmt.key)
          ? PLATFORM_DURATION[fmt.key].max
          : null;
        const tooLong = cap != null && clipDuration > cap;
        const flagged = zones.length > 0 || tooLong;
        const notes = [
          ...(zones.length
            ? [`content under: ${zones.map((z) => z.label).join(", ")}`]
            : []),
          ...(tooLong
            ? [`clip too long (${Math.round(clipDuration)}s > ${cap}s cap)`]
            : []),
        ];
        const canAutofix = flagged && !!campaignId;
        return (
          <div
            key={fmt.key}
            role="button"
            tabIndex={0}
            onClick={() => onPick(fmt.aspect)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onPick(fmt.aspect);
            }}
            title={
              flagged
                ? `Heads up — ${notes.join("; ")}`
                : `${fmt.label} (${fmt.aspect})`
            }
            className={`group relative flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors ${
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
            {canAutofix && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  runAutofix(fmt);
                }}
                disabled={fixing !== null}
                title="Auto-fix this format with AI (costs credits)"
                className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 rounded-full bg-primary/90 px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {fixing === fmt.key ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Sparkles className="h-2.5 w-2.5" />
                )}
                Fix
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
