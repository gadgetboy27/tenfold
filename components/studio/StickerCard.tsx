"use client";

import { useEffect, useRef, useState } from "react";
import { FlipHorizontal2, FlipVertical2, Plus, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { ensureBrandFontsLoaded } from "@/lib/composition/fonts";
import { weightsFor } from "@/lib/composition/layers";
import {
  DEFAULT_STICKER,
  STICKER_EFFECTS,
  STICKER_FONTS,
  type StickerEffect,
  type StickerSpec,
} from "@/lib/composition/sticker";
import { useCompositorStore } from "@/store/useCompositorStore";
import { addStickerToAd, pickStickerTarget, restyleSticker } from "./adBridge";

const EFFECT_LABEL: Record<StickerEffect, string> = {
  none: "Plain",
  shadow: "Shadow",
  glow: "Afterglow",
  neon: "Neon",
  outline: "Outline",
};

const TILTS = [-15, -8, 0, 8, 15];

/**
 * Sticker — the other kind of type. A "SALE" burst, a price, a stamp: its
 * own faces (display first), an effect, a tilt, a flip. Deliberately NOT the
 * Words block and NOT the shared style row: a headline is the brand's voice
 * in the brand's face; a sticker is a thing stuck on top, and the two would
 * fight over one set of controls. Live like Words — with a sticker selected
 * on the stage this card edits it; otherwise Add makes a new one.
 */
export function StickerCard() {
  const [spec, setSpec] = useState<StickerSpec>(DEFAULT_STICKER);
  const [fontsReady, setFontsReady] = useState(false);
  const target = useCompositorStore((s) =>
    pickStickerTarget(s.doc?.layers, s.selectedLayerId),
  );
  const hasDoc = useCompositorStore((s) => s.doc !== null);
  const patchLayout = useCompositorStore((s) => s.patchLayout);

  useEffect(() => {
    void ensureBrandFontsLoaded().then(() => setFontsReady(true));
  }, []);

  // Selecting a sticker on the stage loads its spec into the card — once per
  // selection, not on every store change, or typing would fight itself.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (target && loadedFor.current !== target.id) {
      loadedFor.current = target.id;
      setSpec(target.sticker);
    }
    if (!target) loadedFor.current = null;
  }, [target]);

  // Re-rasterising on every keystroke is fine for chips; for typing it is a
  // PNG per character. A short debounce keeps it live without the churn.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apply = (patch: Partial<StickerSpec>, immediate = false) => {
    const next = { ...spec, ...patch };
    if (patch.font && !weightsFor(patch.font).includes(next.weight)) {
      next.weight = 400;
    }
    setSpec(next);
    if (!target) return;
    if (pending.current) clearTimeout(pending.current);
    const run = () => void restyleSticker(target.id, next);
    if (immediate) run();
    else pending.current = setTimeout(run, 150);
  };

  const add = () => {
    if (!spec.text.trim()) return;
    if (!fontsReady) {
      toast.error("Fonts are still loading — one moment.");
      return;
    }
    if (addStickerToAd({ ...spec, text: spec.text.trim() }) === null) {
      toast.error(
        "Add an image to your ad first — a sticker needs something to sit on.",
      );
    }
  };

  const tilt = (deg: number) => {
    if (target) patchLayout(target.id, { rotationDeg: deg });
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
          <Sparkles className="h-4 w-4" /> Sticker
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {target
            ? "Editing the selected sticker — changes show as you make them."
            : "A SALE burst, a price, a stamp — its own faces and effects. Tilt, flip and mirror it; drag it anywhere."}
        </p>
      </div>

      <input
        value={spec.text}
        onChange={(e) => apply({ text: e.target.value.slice(0, 60) })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !target) add();
        }}
        maxLength={60}
        placeholder="SALE · 50% OFF · NEW"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
      />

      <label className="text-[11px] text-muted-foreground">Face</label>
      <div className="flex flex-wrap gap-1">
        {STICKER_FONTS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => apply({ font: f }, true)}
            style={{ fontFamily: `"${f}", sans-serif` }}
            className={chip(spec.font === f)}
          >
            {f}
          </button>
        ))}
      </div>

      <label className="text-[11px] text-muted-foreground">Effect</label>
      <div className="flex flex-wrap items-center gap-1">
        {STICKER_EFFECTS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => apply({ effect: e }, true)}
            className={chip(spec.effect === e)}
          >
            {EFFECT_LABEL[e]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Colour
          <input
            type="color"
            value={spec.color}
            onInput={(e) => apply({ color: e.currentTarget.value })}
            className="h-7 w-10 cursor-pointer rounded border border-border bg-background"
          />
        </label>
        {spec.effect !== "none" && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {EFFECT_LABEL[spec.effect]} colour
            <input
              type="color"
              value={spec.effectColor}
              onInput={(e) => apply({ effectColor: e.currentTarget.value })}
              className="h-7 w-10 cursor-pointer rounded border border-border bg-background"
            />
          </label>
        )}
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => apply({ flipH: !spec.flipH }, true)}
            title="Mirror left–right"
            className={chip(spec.flipH)}
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => apply({ flipV: !spec.flipV }, true)}
            title="Flip top–bottom"
            className={chip(spec.flipV)}
          >
            <FlipVertical2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      {target ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Tilt</span>
          {TILTS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => tilt(d)}
              className={chip(target.rotationDeg === d)}
            >
              {d > 0 ? `+${d}°` : `${d}°`}
            </button>
          ))}
          <input
            type="range"
            min={-45}
            max={45}
            step={1}
            value={target.rotationDeg}
            onChange={(e) => tilt(Number(e.target.value))}
            aria-label="Tilt"
            className="min-w-0 flex-1 accent-primary"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={add}
          disabled={!spec.text.trim() || !hasDoc}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add sticker
        </button>
      )}
    </div>
  );
}
