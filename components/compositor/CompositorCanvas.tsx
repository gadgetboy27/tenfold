"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ASPECT_DESIGN } from "@/lib/composition/layers";
import { drawFrame, hitTestLayer } from "@/lib/composition/render";
import { ensureBrandFontsLoaded } from "@/lib/composition/fonts";
import { useCompositorStore } from "@/store/useCompositorStore";

export interface CompositorCanvasHandle {
  seek: (t: number) => void;
}

interface Props {
  playing: boolean;
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
  function CompositorCanvas({ playing, onTick, onEnded }, ref) {
    const doc = useCompositorStore((s) => s.doc);
    const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
    const selectLayer = useCompositorStore((s) => s.selectLayer);
    const updateLayer = useCompositorStore((s) => s.updateLayer);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const bgImageRef = useRef<HTMLImageElement | null>(null);
    const imagesRef = useRef(new Map<string, HTMLImageElement>());
    // Virtual clock for image backgrounds.
    const virtualT = useRef(0);
    const lastStamp = useRef<number | null>(null);
    const lastTickAt = useRef(0);
    const drag = useRef<{
      id: string;
      dx: number;
      dy: number;
      startX: number;
      startY: number;
      moved: boolean;
      textReclick: boolean;
    } | null>(null);
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
          paused: !playing,
          draggingLayerId: drag.current?.id ?? null,
          editingLayerId: editing?.id ?? null,
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
      selectedLayerId,
      fontsReady,
      editing,
      onTick,
      onEnded,
    ]);

    // Pointer → design-space coords (canvas buffer is design-sized, CSS-scaled).
    const toDesign = (e: React.PointerEvent | React.MouseEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    // Inline text editing: a DOM textarea positioned over the layer, in the
    // layer's own font/colour. Click a selected text layer (or double-click
    // any text layer) to open it; the side-panel textarea stays in sync via
    // the shared store.
    const beginEdit = (layerId: string) => {
      const canvas = canvasRef.current;
      const wrapper = wrapperRef.current;
      const layer = doc?.layers.find((l) => l.id === layerId);
      if (!canvas || !wrapper || !layer || layer.kind !== "text") return;
      const c = canvas.getBoundingClientRect();
      const w = wrapper.getBoundingClientRect();
      const s = c.width / canvas.width; // design px → display px
      setEditing({
        id: layer.id,
        left: c.left - w.left + layer.x * s,
        top: c.top - w.top + layer.y * s,
        width: Math.min(c.width * 0.85, 560),
        fontSize: Math.max(11, layer.sizePx * layer.scale * s),
      });
      selectLayer(layer.id);
    };

    const onPointerDown = (e: React.PointerEvent) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !doc) return;
      const p = toDesign(e);
      const hit = hitTestLayer(ctx, doc, p.x, p.y, imagesRef.current);
      const wasSelected = hit?.id === selectedLayerId;
      selectLayer(hit?.id ?? null);
      if (hit) {
        drag.current = {
          id: hit.id,
          dx: p.x - hit.x,
          dy: p.y - hit.y,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          textReclick: wasSelected && hit.kind === "text",
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      // A few px of jitter is a click, not a drag.
      if (
        !d.moved &&
        Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5
      )
        return;
      d.moved = true;
      const p = toDesign(e);
      updateLayer(d.id, {
        x: Math.round(p.x - d.dx),
        y: Math.round(p.y - d.dy),
      });
    };

    const onPointerUp = () => {
      const d = drag.current;
      drag.current = null;
      // Click (no drag) on an already-selected text layer opens inline edit.
      if (d && !d.moved && d.textReclick) beginEdit(d.id);
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
          onDoubleClick={onDoubleClick}
          className="max-h-full max-w-full cursor-grab rounded-lg border border-border bg-black object-contain active:cursor-grabbing"
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
