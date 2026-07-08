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
    const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
    const [fontsReady, setFontsReady] = useState(false);

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
        });

        if (stamp - lastTickAt.current > 100) {
          lastTickAt.current = stamp;
          onTick(t, duration);
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [doc, isVideo, playing, selectedLayerId, fontsReady, onTick, onEnded]);

    // Pointer → design-space coords (canvas buffer is design-sized, CSS-scaled).
    const toDesign = (e: React.PointerEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    const onPointerDown = (e: React.PointerEvent) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !doc) return;
      const p = toDesign(e);
      const hit = hitTestLayer(ctx, doc, p.x, p.y, imagesRef.current);
      selectLayer(hit?.id ?? null);
      if (hit) {
        drag.current = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (!drag.current) return;
      const p = toDesign(e);
      updateLayer(drag.current.id, {
        x: Math.round(p.x - drag.current.dx),
        y: Math.round(p.y - drag.current.dy),
      });
    };

    const onPointerUp = () => {
      drag.current = null;
    };

    if (!doc) return null;
    const { width, height } = ASPECT_DESIGN[doc.aspect];

    return (
      <div className="relative flex h-full w-full items-center justify-center">
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
          className="max-h-full max-w-full cursor-grab rounded-lg border border-border bg-black object-contain active:cursor-grabbing"
        />
      </div>
    );
  },
);
