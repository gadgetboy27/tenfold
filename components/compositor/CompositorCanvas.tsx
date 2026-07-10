"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ASPECT_DESIGN,
  centerToPos,
  effectiveLayer,
  resolveCenter,
  type Layer,
} from "@/lib/composition/layers";
import {
  drawFrame,
  hitTestLayer,
  layerBounds,
  layerCenter,
} from "@/lib/composition/render";
import { wrapText } from "@/lib/composition/brand-apply";
import { ensureBrandFontsLoaded } from "@/lib/composition/fonts";
import { useCompositorStore } from "@/store/useCompositorStore";

/** Edge/corner zones for manual resizing; "move" = inside the box. */
type Zone = "move" | "l" | "r" | "t" | "b" | "tl" | "tr" | "bl" | "br";

const ZONE_CURSOR: Record<Zone, string> = {
  move: "grab",
  l: "ew-resize",
  r: "ew-resize",
  t: "ns-resize",
  b: "ns-resize",
  tl: "nwse-resize",
  br: "nwse-resize",
  tr: "nesw-resize",
  bl: "nesw-resize",
};

type PointerAction =
  | {
      mode: "move";
      id: string;
      dx: number;
      dy: number;
      startX: number;
      startY: number;
      moved: boolean;
      textReclick: boolean;
    }
  | {
      mode: "resize";
      id: string;
      zone: Exclude<Zone, "move">;
      cx: number;
      cy: number;
      startX: number;
      startY: number;
      startScale: number;
      /** Text side-resize: the unwrapped source + average char width. */
      raw?: string;
      avgCharW?: number;
      lastMaxChars?: number;
    };

export interface CompositorCanvasHandle {
  seek: (t: number) => void;
}

interface Props {
  playing: boolean;
  /** Finished-look preview: no arrange ghosts, no outlines — exactly what
   *  the export renders, even while paused. */
  cleanPreview?: boolean;
  /** ~10Hz clock updates for the scrubber. */
  onTick: (t: number, duration: number) => void;
  onEnded: () => void;
}

/**
 * The compositor preview: a canvas at design resolution (CSS-scaled to fit)
 * redrawn every animation frame — background footage via the video element's
 * currentTime master clock (or a virtual clock for image backgrounds), then
 * layers back-to-front. Also owns drag-to-position.
 */
export const CompositorCanvas = forwardRef<CompositorCanvasHandle, Props>(
  function CompositorCanvas({ playing, cleanPreview, onTick, onEnded }, ref) {
    const doc = useCompositorStore((s) => s.doc);
    const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
    const selectLayer = useCompositorStore((s) => s.selectLayer);
    const updateLayer = useCompositorStore((s) => s.updateLayer);
    const patchLayout = useCompositorStore((s) => s.patchLayout);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const bgImageRef = useRef<HTMLImageElement | null>(null);
    const imagesRef = useRef(new Map<string, HTMLImageElement>());
    // Virtual clock for image backgrounds.
    const virtualT = useRef(0);
    const lastStamp = useRef<number | null>(null);
    const lastTickAt = useRef(0);
    const action = useRef<PointerAction | null>(null);
    const hoverEdge = useRef(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [fontsReady, setFontsReady] = useState(false);
    // Inline text editing overlay (display-space position + font size).
    const [editing, setEditing] = useState<{
      id: string;
      left: number;
      top: number;
      width: number;
      fontSize: number;
    } | null>(null);

    useEffect(() => {
      ensureBrandFontsLoaded().then(() => setFontsReady(true));
    }, []);

    const isVideo = doc?.background.kind === "video";
    const bgSrc = doc?.background.src;

    // (Re)load the background element when the source changes.
    useEffect(() => {
      if (!bgSrc) return;
      if (isVideo) {
        bgImageRef.current = null;
        virtualT.current = 0;
      } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = bgSrc;
        bgImageRef.current = img;
        virtualT.current = 0;
      }
    }, [bgSrc, isVideo]);

    // Keep layer images cached (drawImage only — never through a model).
    useEffect(() => {
      const cache = imagesRef.current;
      for (const layer of doc?.layers ?? []) {
        if (layer.kind === "image" && !cache.has(layer.src)) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = layer.src;
          cache.set(layer.src, img);
        }
      }
    }, [doc?.layers]);

    // Play/pause the master clock.
    useEffect(() => {
      const video = videoRef.current;
      if (isVideo && video) {
        if (playing) video.play().catch(() => {});
        else video.pause();
      }
      lastStamp.current = null; // reset virtual clock delta either way
    }, [playing, isVideo]);

    useImperativeHandle(ref, () => ({
      seek: (t: number) => {
        if (isVideo && videoRef.current) videoRef.current.currentTime = t;
        else virtualT.current = t;
      },
    }));

    // The render loop.
    useEffect(() => {
      let raf = 0;
      const loop = (stamp: number) => {
        raf = requestAnimationFrame(loop);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !doc) return;

        const duration =
          (isVideo ? videoRef.current?.duration : doc.background.durationSec) ||
          doc.background.durationSec ||
          10;

        let t: number;
        if (isVideo) {
          t = videoRef.current?.currentTime ?? 0;
        } else {
          if (playing) {
            const dt =
              lastStamp.current === null
                ? 0
                : (stamp - lastStamp.current) / 1000;
            virtualT.current = virtualT.current + dt;
            if (virtualT.current >= duration) {
              virtualT.current = duration;
              onEnded();
            }
          }
          lastStamp.current = stamp;
          t = virtualT.current;
        }

        drawFrame(ctx, {
          doc,
          t,
          clipDuration: duration,
          background: isVideo ? videoRef.current : bgImageRef.current,
          images: imagesRef.current,
          selectedLayerId,
          paused: !playing && !cleanPreview,
          draggingLayerId: action.current?.id ?? null,
          editingLayerId: editing?.id ?? null,
          forceOutline: hoverEdge.current || action.current?.mode === "resize",
        });

        if (stamp - lastTickAt.current > 100) {
          lastTickAt.current = stamp;
          onTick(t, duration);
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [
      doc,
      isVideo,
      playing,
      cleanPreview,
      selectedLayerId,
      fontsReady,
      editing,
      onTick,
      onEnded,
    ]);

    // Keep the inline text editor glued to its layer through window resizes —
    // the canvas is CSS-scaled, so display coordinates shift with the screen.
    useEffect(() => {
      if (!editing) return;
      const relocate = () => {
        const canvas = canvasRef.current;
        const wrapper = wrapperRef.current;
        const layer = doc?.layers.find((l) => l.id === editing.id);
        const ctx = canvas?.getContext("2d");
        if (
          !canvas ||
          !ctx ||
          !wrapper ||
          !doc ||
          !layer ||
          layer.kind !== "text"
        )
          return;
        const c = canvas.getBoundingClientRect();
        const w = wrapper.getBoundingClientRect();
        const s = c.width / canvas.width;
        // Inline (not the `eff` closure) so this effect's deps stay stable.
        const e = effectiveLayer(layer, doc.aspect, doc.overrides);
        const centre = layerCenter(ctx, e, doc.aspect, imagesRef.current);
        setEditing(
          (prev) =>
            prev && {
              ...prev,
              left: c.left - w.left + centre.x * s,
              top: c.top - w.top + centre.y * s,
              width: Math.min(c.width * 0.85, 560),
              fontSize:
                e.kind === "text" ? Math.max(11, e.sizePx * e.scale * s) : 11,
            },
        );
      };
      window.addEventListener("resize", relocate);
      return () => window.removeEventListener("resize", relocate);
    }, [editing, doc]);

    // Pointer → design-space coords (canvas buffer is design-sized, CSS-scaled).
    const toDesign = (e: React.PointerEvent | React.MouseEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    // The layer as it renders in the current aspect — per-format overrides
    // applied — so geometry (centre/bounds/handles) matches what's on screen.
    const eff = (layer: Layer): Layer =>
      doc ? effectiveLayer(layer, doc.aspect, doc.overrides) : layer;

    // Inline text editing: a DOM textarea positioned over the layer, in the
    // layer's own font/colour. Click a selected text layer (or double-click
    // any text layer) to open it; the side-panel textarea stays in sync via
    // the shared store.
    const beginEdit = (layerId: string) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const wrapper = wrapperRef.current;
      const layer = doc?.layers.find((l) => l.id === layerId);
      if (
        !canvas ||
        !ctx ||
        !wrapper ||
        !doc ||
        !layer ||
        layer.kind !== "text"
      )
        return;
      const c = canvas.getBoundingClientRect();
      const w = wrapper.getBoundingClientRect();
      const s = c.width / canvas.width; // design px → display px
      const e = eff(layer);
      const centre = layerCenter(ctx, e, doc.aspect, imagesRef.current);
      setEditing({
        id: layer.id,
        left: c.left - w.left + centre.x * s,
        top: c.top - w.top + centre.y * s,
        width: Math.min(c.width * 0.85, 560),
        fontSize: e.kind === "text" ? Math.max(11, e.sizePx * e.scale * s) : 11,
      });
      selectLayer(layer.id);
    };

    // Which zone of a layer's box the pointer is in — edges/corners resize,
    // the interior moves. The band is ~9 display px, converted to design px.
    const zoneFor = (
      ctx: CanvasRenderingContext2D,
      layer: Layer,
      px: number,
      py: number,
    ): Zone | null => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const band = 9 / (rect.width / canvas.width);
      const e = eff(layer);
      const b = layerBounds(ctx, e, imagesRef.current);
      const hw = (b.width * e.scale) / 2;
      const hh = (b.height * e.scale) / 2;
      const c = resolveCenter(e.pos, doc!.aspect, hw, hh);
      const dx = px - c.x;
      const dy = py - c.y;
      if (Math.abs(dx) > hw + band || Math.abs(dy) > hh + band) return null;
      const nearL = Math.abs(dx + hw) <= band;
      const nearR = Math.abs(dx - hw) <= band;
      const nearT = Math.abs(dy + hh) <= band;
      const nearB = Math.abs(dy - hh) <= band;
      if (nearT && nearL) return "tl";
      if (nearT && nearR) return "tr";
      if (nearB && nearL) return "bl";
      if (nearB && nearR) return "br";
      if (nearL) return "l";
      if (nearR) return "r";
      if (nearT) return "t";
      if (nearB) return "b";
      return Math.abs(dx) <= hw && Math.abs(dy) <= hh ? "move" : null;
    };

    const setCursor = (cursor: string) => {
      if (canvasRef.current) canvasRef.current.style.cursor = cursor;
    };

    const onPointerDown = (e: React.PointerEvent) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !doc) return;
      const p = toDesign(e);

      // Edge/corner of the SELECTED layer → start a resize.
      const sel = doc.layers.find((l) => l.id === selectedLayerId);
      const selZone = sel ? zoneFor(ctx, sel, p.x, p.y) : null;
      if (sel && selZone && selZone !== "move") {
        const selEff = eff(sel);
        let raw: string | undefined;
        let avgCharW: number | undefined;
        if (selEff.kind === "text") {
          raw = selEff.text.replace(/\n/g, " ");
          ctx.save();
          ctx.font = `${selEff.sizePx}px "${selEff.font}", sans-serif`;
          avgCharW = ctx.measureText(raw).width / Math.max(1, raw.length);
          ctx.restore();
        }
        const selCentre = layerCenter(
          ctx,
          selEff,
          doc.aspect,
          imagesRef.current,
        );
        action.current = {
          mode: "resize",
          id: sel.id,
          zone: selZone,
          cx: selCentre.x,
          cy: selCentre.y,
          startX: p.x,
          startY: p.y,
          startScale: selEff.scale,
          raw,
          avgCharW,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      const hit = hitTestLayer(ctx, doc, p.x, p.y, imagesRef.current);
      const wasSelected = hit?.id === selectedLayerId;
      selectLayer(hit?.id ?? null);
      if (hit) {
        const hitCentre = layerCenter(
          ctx,
          eff(hit),
          doc.aspect,
          imagesRef.current,
        );
        action.current = {
          mode: "move",
          id: hit.id,
          dx: p.x - hitCentre.x,
          dy: p.y - hitCentre.y,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          textReclick: wasSelected && hit.kind === "text",
        };
        setCursor("grabbing");
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e: React.PointerEvent) => {
      const a = action.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !doc) return;
      const p = toDesign(e);

      if (!a) {
        // Hover feedback: pull cursor on the selected layer's edge line,
        // grab inside any layer, default elsewhere.
        const sel = doc.layers.find((l) => l.id === selectedLayerId);
        const selZone = sel ? zoneFor(ctx, sel, p.x, p.y) : null;
        hoverEdge.current = !!selZone && selZone !== "move";
        if (selZone && selZone !== "move") setCursor(ZONE_CURSOR[selZone]);
        else if (hitTestLayer(ctx, doc, p.x, p.y, imagesRef.current))
          setCursor("grab");
        else setCursor("default");
        return;
      }

      if (a.mode === "move") {
        // A few px of jitter is a click, not a drag.
        if (
          !a.moved &&
          Math.hypot(e.clientX - a.startX, e.clientY - a.startY) < 5
        )
          return;
        a.moved = true;
        const master = doc.layers.find((l) => l.id === a.id);
        if (!master) return;
        const layer = eff(master);
        // New design-space centre → aspect-independent pos (mode-preserving).
        // Writes to the master, or this aspect's override in override mode.
        const b = layerBounds(ctx, layer, imagesRef.current);
        patchLayout(a.id, {
          pos: centerToPos(
            layer.pos,
            p.x - a.dx,
            p.y - a.dy,
            doc.aspect,
            (b.width * layer.scale) / 2,
            (b.height * layer.scale) / 2,
          ),
        });
        return;
      }

      // Resize. Text pulled by a side edge re-wraps to fill the new box
      // width (same centre and margins); everything else scales uniformly.
      const master = doc.layers.find((l) => l.id === a.id);
      if (!master) return;
      const layer = eff(master);
      const sideOnly = a.zone === "l" || a.zone === "r";
      if (layer.kind === "text" && sideOnly && a.raw && a.avgCharW) {
        const targetW = Math.max(80, Math.abs(p.x - a.cx) * 2);
        const maxChars = Math.max(
          4,
          Math.round(targetW / (layer.scale * a.avgCharW)),
        );
        if (maxChars !== a.lastMaxChars) {
          a.lastMaxChars = maxChars;
          // Re-wrapping changes text content → shared across formats (master).
          updateLayer(a.id, { text: wrapText(a.raw, maxChars) });
        }
        return;
      }
      const vertical = a.zone === "t" || a.zone === "b";
      const f = sideOnly
        ? Math.abs(p.x - a.cx) / Math.max(1, Math.abs(a.startX - a.cx))
        : vertical
          ? Math.abs(p.y - a.cy) / Math.max(1, Math.abs(a.startY - a.cy))
          : Math.hypot(p.x - a.cx, p.y - a.cy) /
            Math.max(1, Math.hypot(a.startX - a.cx, a.startY - a.cy));
      patchLayout(a.id, {
        scale: Math.min(20, Math.max(0.05, a.startScale * f)),
      });
    };

    const onPointerUp = () => {
      const a = action.current;
      action.current = null;
      setCursor("default");
      // Click (no drag) on an already-selected text layer opens inline edit.
      if (a?.mode === "move" && !a.moved && a.textReclick) beginEdit(a.id);
    };

    const onPointerLeave = () => {
      if (!action.current) {
        hoverEdge.current = false;
        setCursor("default");
      }
    };

    const onDoubleClick = (e: React.MouseEvent) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !doc) return;
      const p = toDesign(e);
      const hit = hitTestLayer(ctx, doc, p.x, p.y, imagesRef.current);
      if (hit?.kind === "text") beginEdit(hit.id);
    };

    if (!doc) return null;
    const { width, height } = ASPECT_DESIGN[doc.aspect];
    const editingLayer = editing
      ? doc.layers.find((l) => l.id === editing.id)
      : null;

    return (
      <div
        ref={wrapperRef}
        className="relative flex h-full w-full items-center justify-center"
      >
        {isVideo && (
          <video
            ref={videoRef}
            src={doc.background.src}
            crossOrigin="anonymous"
            muted
            playsInline
            preload="auto"
            onEnded={onEnded}
            className="hidden"
          />
        )}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onDoubleClick={onDoubleClick}
          className="max-h-full max-w-full rounded-lg border border-border bg-black object-contain"
        />
        {editing && editingLayer?.kind === "text" && (
          <textarea
            autoFocus
            value={editingLayer.text}
            rows={editingLayer.text.split("\n").length}
            onChange={(e) => updateLayer(editing.id, { text: e.target.value })}
            onFocus={(e) => e.target.select()}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(null);
            }}
            style={{
              left: editing.left,
              top: editing.top,
              width: editing.width,
              fontSize: editing.fontSize,
              lineHeight: 1.25,
              color: editingLayer.color,
              fontFamily: `"${editingLayer.font}", sans-serif`,
            }}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 resize-none rounded-lg border border-primary/70 bg-black/40 p-1 text-center outline-none backdrop-blur-[2px]"
          />
        )}
      </div>
    );
  },
);
