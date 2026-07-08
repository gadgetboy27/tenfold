"use client";

import { useCallback, useRef, useState } from "react";
import { Play, Pause, ImagePlus, Type, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ASPECT_DESIGN,
  type CompositionAspect,
} from "@/lib/composition/layers";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  CompositorCanvas,
  type CompositorCanvasHandle,
} from "./CompositorCanvas";
import { LayerList } from "./LayerList";
import { LayerControls } from "./LayerControls";

const ASPECTS: CompositionAspect[] = ["9:16", "1:1", "16:9"];

function fmt(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

/**
 * The layered compositor (docs/tenfold-compositor-brief.md §4): canvas preview
 * with drag-to-position, timeline-lite transport, aspect presets, and the
 * layer stack + property controls. Load a doc into useCompositorStore first.
 */
export function Compositor() {
  const doc = useCompositorStore((s) => s.doc);
  const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
  const setAspect = useCompositorStore((s) => s.setAspect);
  const addLayer = useCompositorStore((s) => s.addLayer);

  const canvasRef = useRef<CompositorCanvasHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(10);

  const onTick = useCallback((t: number, d: number) => {
    setTime(t);
    if (d > 0 && Number.isFinite(d)) setDuration(d);
  }, []);
  const onEnded = useCallback(() => setPlaying(false), []);

  if (!doc) return null;
  const design = ASPECT_DESIGN[doc.aspect];
  const selected = doc.layers.find((l) => l.id === selectedLayerId) ?? null;

  const addImageLayer = (file: File) => {
    addLayer({
      id: crypto.randomUUID(),
      kind: "image",
      src: URL.createObjectURL(file),
      x: design.width / 2,
      y: design.height / 2,
      scale: 0.5,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    });
  };

  const addTextLayer = () => {
    addLayer({
      id: crypto.randomUUID(),
      kind: "text",
      text: "Your caption here",
      font: "Inter",
      sizePx: 72,
      color: "#ffffff",
      x: design.width / 2,
      y: design.height * 0.85,
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0.5,
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 md:flex-row">
      {/* ── Canvas + transport ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a}
              onClick={() => setAspect(a)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                doc.aspect === a
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1">
          <CompositorCanvas
            ref={canvasRef}
            playing={playing}
            onTick={onTick}
            onEnded={onEnded}
          />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!playing && time >= duration - 0.05) {
                canvasRef.current?.seek(0);
              }
              setPlaying(!playing);
            }}
            className="h-8 w-8 shrink-0 p-0"
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
            {fmt(time)}
          </span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={Math.min(time, duration)}
            onChange={(e) => {
              canvasRef.current?.seek(+e.target.value);
              setTime(+e.target.value);
            }}
            className="flex-1 accent-primary"
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {fmt(duration)}
          </span>
        </div>
      </div>

      {/* ── Layer stack + properties ── */}
      <div className="flex w-full flex-col gap-4 md:w-80 md:shrink-0">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-primary" /> Layers
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                className="h-7 gap-1 px-2 text-xs"
              >
                <ImagePlus className="h-3.5 w-3.5" /> Image
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={addTextLayer}
                className="h-7 gap-1 px-2 text-xs"
              >
                <Type className="h-3.5 w-3.5" /> Text
              </Button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addImageLayer(f);
              e.target.value = "";
            }}
          />
          <LayerList />
        </div>

        {selected && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-semibold">Layer properties</p>
            <LayerControls layer={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
