"use client";

import { Zap } from "lucide-react";
import { FX_META, isPulse, switchFxKind } from "@/lib/composition/fx/catalog";
import {
  PIXEL_FX_KINDS,
  type PixelFx,
  type PixelFxKind,
} from "@/lib/composition/fx/types";
import type { ImageLayer, StickerSpec } from "@/lib/composition/layers";
import { useCompositorStore } from "@/store/useCompositorStore";
import { setStickerFx } from "./adBridge";
import { fxChip, FxSlider, FxTimeline } from "./FxControls";

/** "Make it move" — an effect on the sticker's letters, with a start point as
 *  a percentage of the clip. Follows the stage selection, like Style does. */
export function StickerFxCard({
  target,
}: {
  target: (ImageLayer & { sticker: StickerSpec }) | null;
}) {
  const clipSec = useCompositorStore(
    (s) => s.doc?.background.durationSec ?? 10,
  );
  if (!target) return null;
  const fx = target.sticker.fx;
  const set = (patch: Partial<PixelFx>) =>
    fx && setStickerFx(target.id, { ...fx, ...patch });
  const meta = fx ? FX_META[fx.kind] : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4" /> Make it move
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          An effect on the letters, timed as a share of the video so it lands in
          the same place at 10, 15 or 30 seconds. Press play on the stage to
          watch it.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setStickerFx(target.id, null)}
          className={fxChip(!fx)}
        >
          Off
        </button>
        {PIXEL_FX_KINDS.map((k: PixelFxKind) => (
          <button
            key={k}
            type="button"
            onClick={() => setStickerFx(target.id, switchFxKind(fx, k))}
            className={fxChip(fx?.kind === k)}
          >
            {FX_META[k].label}
          </button>
        ))}
      </div>

      {fx && meta && (
        <>
          <p className="text-xs text-muted-foreground">{meta.blurb}</p>
          <FxTimeline
            fx={fx}
            clipSec={clipSec}
            onStart={(startPct) => set({ startPct })}
          />
          {!isPulse(fx.kind) && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => set({ mode: "out" })}
                className={fxChip(fx.mode === "out")}
              >
                Breaks apart
              </button>
              <button
                type="button"
                onClick={() => set({ mode: "in" })}
                className={fxChip(fx.mode === "in")}
              >
                Builds up
              </button>
            </div>
          )}
          <FxSlider
            label="Lasts"
            value={fx.lengthSec}
            min={0.3}
            max={3}
            step={0.1}
            unit="s"
            onChange={(lengthSec) => set({ lengthSec })}
          />
          <FxSlider
            label="Strength"
            value={fx.intensity}
            min={0.5}
            max={2}
            step={0.1}
            unit="×"
            onChange={(intensity) => set({ intensity })}
          />
          {isPulse(fx.kind) && (
            <FxSlider
              label="Repeat"
              value={fx.repeat}
              min={1}
              max={5}
              step={1}
              unit="×"
              onChange={(repeat) => set({ repeat })}
            />
          )}
          {meta.defaultColor && (
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="w-20 shrink-0">Colour</span>
              <input
                type="color"
                value={fx.color ?? meta.defaultColor}
                onInput={(e) => set({ color: e.currentTarget.value })}
                onChange={(e) => set({ color: e.currentTarget.value })}
                className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
