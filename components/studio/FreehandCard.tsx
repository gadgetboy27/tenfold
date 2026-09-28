"use client";

import { useRef, useState } from "react";
import { Eraser, PenTool, Plus, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  BRUSH_LABELS,
  BRUSH_TYPES,
  FREEHAND_CANVAS_PX,
  drawSegment,
  drawStroke,
  rasterizeFreehand,
  toCanvasPoint,
  type BrushType,
  type Stroke,
} from "@/lib/composition/freehand";
import { PEN_PALETTES } from "@/lib/composition/sticker";
import { addImageToAd } from "./adBridge";

/**
 * Freehand — an actual drawing surface, not a style picker. Sticker styles
 * TEXT automatically (pick "Marker", the whole word renders marker-styled);
 * this is the literal tool people asked for after seeing that: pick a brush,
 * draw with the pointer, and the result becomes an image layer like anything
 * else placed on the ad. Its own card rather than a mode inside StickerCard —
 * typing and drawing are different enough interactions that mixing them into
 * one component would double it for no real gain, and every other tool in
 * Wording is already one card per concern.
 */
// Standard image-editor transparency checkerboard — shown behind the canvas
// so "this is see-through" is something you can SEE while drawing, not just
// a claim. A flat white edit-time background (the old default) looked
// identical whether the export would be transparent or opaque white, which
// is exactly the ambiguity that prompted this.
const TRANSPARENCY_CHECKER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #ddd 25%, transparent 25%), " +
    "linear-gradient(-45deg, #ddd 25%, transparent 25%), " +
    "linear-gradient(45deg, transparent 75%, #ddd 75%), " +
    "linear-gradient(-45deg, transparent 75%, #ddd 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  backgroundColor: "#fff",
};

export function FreehandCard() {
  const [brush, setBrush] = useState<BrushType>("fine");
  const [color, setColor] = useState("#1a1a1a");
  const [size, setSize] = useState(10);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  // Off by default — the whole point is that a drawing doesn't block the
  // image it lands on. Same "off unless asked for" shape as the Words
  // layer's "Panel behind" scrim, just inverted in spirit: that one adds a
  // panel for LEGIBILITY over busy footage; this one adds one so a drawing
  // can double as a solid banner/card background when that's what's wanted.
  const [panelBehind, setPanelBehind] = useState(false);
  const [panelColor, setPanelColor] = useState("#ffffff");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const redraw = (next: Stroke[]) => {
    const c = canvasRef.current;
    const g = ctx();
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    for (const s of next) drawStroke(g, s);
  };

  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const p = toCanvasPoint(e.clientX, e.clientY, canvas);
    currentStroke.current = { points: [p], color, brush, size };
    drawing.current = true;
  };

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const g = ctx();
    const stroke = currentStroke.current;
    if (!drawing.current || !canvas || !g || !stroke) return;
    const p = toCanvasPoint(e.clientX, e.clientY, canvas);
    const last = stroke.points[stroke.points.length - 1];
    drawSegment(g, last, p, stroke);
    stroke.points.push(p);
  };

  const pointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const stroke = currentStroke.current;
    currentStroke.current = null;
    if (stroke) setStrokes((prev) => [...prev, stroke]);
  };

  const undo = () => {
    const next = strokes.slice(0, -1);
    setStrokes(next);
    redraw(next);
  };

  const clear = () => {
    setStrokes([]);
    redraw([]);
  };

  const add = () => {
    if (strokes.length === 0) return;
    const raster = rasterizeFreehand(
      strokes,
      FREEHAND_CANVAS_PX,
      panelBehind ? panelColor : undefined,
    );
    const where = addImageToAd(raster.dataUrl);
    toast.success(
      where === "background"
        ? "Added as your ad's backdrop"
        : "Added — drag it where you want it",
    );
    clear();
  };

  const chip = (on: boolean) =>
    `rounded-md border px-2 py-1 text-xs transition-colors ${
      on
        ? "border-primary text-primary"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PenTool className="h-4 w-4" /> Freehand
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Draw with a real brush — a banner, an underline, a doodle — then add
          it to the ad like any other image.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {BRUSH_TYPES.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBrush(b)}
            className={chip(brush === b)}
          >
            {BRUSH_LABELS[b]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Colour
          <input
            type="color"
            value={color}
            onInput={(e) => setColor(e.currentTarget.value)}
            className="h-7 w-10 cursor-pointer rounded border border-border bg-background"
          />
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
          Brush size
          <input
            type="range"
            min={2}
            max={40}
            step={1}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Brush size"
            className="min-w-0 flex-1 accent-primary"
          />
          <span className="w-6 shrink-0 text-right tabular-nums">{size}</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {PEN_PALETTES.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setColor(p.color)}
            title={p.label}
            className="h-5 w-5 shrink-0 rounded-full border border-border/60"
            style={{ backgroundColor: p.color }}
          />
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={panelBehind}
            onChange={(e) => setPanelBehind(e.target.checked)}
          />
          Panel behind
        </label>
        {panelBehind && (
          <input
            type="color"
            value={panelColor}
            onInput={(e) => setPanelColor(e.currentTarget.value)}
            title="Panel colour"
            className="h-6 w-8 cursor-pointer rounded border border-border bg-background"
          />
        )}
      </div>

      <canvas
        ref={canvasRef}
        width={FREEHAND_CANVAS_PX}
        height={FREEHAND_CANVAS_PX}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={pointerUp}
        style={
          panelBehind ? { backgroundColor: panelColor } : TRANSPARENCY_CHECKER
        }
        className="aspect-square w-full touch-none rounded-xl border border-border"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={strokes.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={strokes.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <Eraser className="h-3.5 w-3.5" /> Clear
        </button>
        <button
          type="button"
          onClick={add}
          disabled={strokes.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add to ad
        </button>
      </div>
    </div>
  );
}
