"use client";

import { FlipHorizontal2, FlipVertical2, Palette } from "lucide-react";
import { BRAND_FONTS } from "@/lib/composition/layers";
import {
  PEN_PALETTES,
  STICKER_EFFECTS,
  STICKER_FONTS,
  type StickerEffect,
  type StickerSpec,
} from "@/lib/composition/sticker";
import type { TextStyle } from "./adBridge";
import { chip, ColourField, FontRow, WeightRow } from "./StyleRows";

const EFFECT_LABEL: Record<StickerEffect, string> = {
  none: "Plain",
  shadow: "Shadow",
  glow: "Afterglow",
  neon: "Neon",
  outline: "Outline",
  marker: "Marker",
  spray: "Graffiti spray",
  calligraphy: "Calligraphy",
};
/** Effects with a brush-size knob; the rest keep their fixed proportions. */
const SIZABLE = new Set<StickerEffect>(["marker", "spray", "calligraphy"]);
const TILTS = [-15, -8, 0, 8, 15];

export type ToolboxSubject = "text" | "sticker";

/**
 * The ONE place lettering is styled. It edits whatever is selected on the ad —
 * a headline, the caption or a sticker — and only that; with nothing selected
 * it sets the look of the next one you add. Each kind keeps the controls that
 * are true for it (a sticker has effects, tilt and flips; plain text has a
 * panel behind it), but the face, weight and colour pickers are the same ones.
 */
export function StyleToolbox({
  subject,
  canSwitch,
  onSubject,
  legend,
  text,
  sticker,
}: {
  subject: ToolboxSubject;
  /** Nothing is selected, so the user chooses which kind of lettering to set up. */
  canSwitch: boolean;
  onSubject: (s: ToolboxSubject) => void;
  legend: string;
  text: { style: TextStyle; onChange: (patch: Partial<TextStyle>) => void };
  sticker: {
    spec: StickerSpec;
    onChange: (patch: Partial<StickerSpec>, immediate?: boolean) => void;
    /** Present only when a sticker is selected — tilt acts on that layer. */
    tilt: number | null;
    onTilt: (deg: number) => void;
  };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4" /> Style
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{legend}</p>
        </div>
        {canSwitch && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className={chip(subject === "text")}
              onClick={() => onSubject("text")}
            >
              Words
            </button>
            <button
              type="button"
              className={chip(subject === "sticker")}
              onClick={() => onSubject("sticker")}
            >
              Sticker
            </button>
          </div>
        )}
      </div>

      {subject === "text" ? (
        <>
          <label className="text-[11px] text-muted-foreground">Font</label>
          <FontRow
            fonts={BRAND_FONTS}
            value={text.style.font}
            onPick={(font) =>
              text.onChange({ font: font as TextStyle["font"] })
            }
          />
          <WeightRow
            font={text.style.font}
            value={text.style.weight}
            onPick={(weight) => text.onChange({ weight })}
          />
          <div className="flex items-center gap-3">
            <ColourField
              label="Colour"
              value={text.style.color}
              onChange={(color) => text.onChange({ color })}
            />
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={text.style.scrim}
                onChange={(e) => text.onChange({ scrim: e.target.checked })}
              />
              Panel behind
            </label>
          </div>
        </>
      ) : (
        <>
          <label className="text-[11px] text-muted-foreground">Font</label>
          <FontRow
            fonts={STICKER_FONTS}
            value={sticker.spec.font}
            onPick={(font) =>
              sticker.onChange({ font: font as StickerSpec["font"] }, true)
            }
          />
          <WeightRow
            font={sticker.spec.font}
            value={sticker.spec.weight}
            onPick={(weight) => sticker.onChange({ weight }, true)}
          />

          <label className="text-[11px] text-muted-foreground">Effect</label>
          <div className="flex flex-wrap gap-1">
            {STICKER_EFFECTS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => sticker.onChange({ effect: e }, true)}
                className={chip(sticker.spec.effect === e)}
              >
                {EFFECT_LABEL[e]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ColourField
              label="Colour"
              value={sticker.spec.color}
              onChange={(color) => sticker.onChange({ color })}
            />
            {sticker.spec.effect !== "none" && (
              <ColourField
                label={`${EFFECT_LABEL[sticker.spec.effect]} colour`}
                value={sticker.spec.effectColor}
                onChange={(effectColor) => sticker.onChange({ effectColor })}
              />
            )}
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                title="Mirror left–right"
                onClick={() =>
                  sticker.onChange({ flipH: !sticker.spec.flipH }, true)
                }
                className={chip(sticker.spec.flipH)}
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Flip top–bottom"
                onClick={() =>
                  sticker.onChange({ flipV: !sticker.spec.flipV }, true)
                }
                className={chip(sticker.spec.flipV)}
              >
                <FlipVertical2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>

          {sticker.spec.effect !== "none" && (
            <div className="flex flex-wrap gap-1.5">
              {PEN_PALETTES.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  title={p.label}
                  onClick={() =>
                    sticker.onChange(
                      { color: p.color, effectColor: p.effectColor },
                      true,
                    )
                  }
                  className="flex items-center gap-1 rounded-md border border-border px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <span className="flex h-3.5 w-3.5 overflow-hidden rounded-full border border-border/60">
                    <span
                      className="h-full w-1/2"
                      style={{ backgroundColor: p.color }}
                    />
                    <span
                      className="h-full w-1/2"
                      style={{ backgroundColor: p.effectColor }}
                    />
                  </span>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {SIZABLE.has(sticker.spec.effect) && (
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Brush size
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={sticker.spec.effectSize}
                onChange={(e) =>
                  sticker.onChange({ effectSize: Number(e.target.value) })
                }
                aria-label="Brush size"
                className="min-w-0 flex-1 accent-primary"
              />
              <span className="w-8 shrink-0 text-right tabular-nums">
                {sticker.spec.effectSize.toFixed(1)}×
              </span>
            </label>
          )}

          {sticker.tilt !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Tilt</span>
              {TILTS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => sticker.onTilt(d)}
                  className={chip(sticker.tilt === d)}
                >
                  {d > 0 ? `+${d}°` : `${d}°`}
                </button>
              ))}
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={sticker.tilt}
                onChange={(e) => sticker.onTilt(Number(e.target.value))}
                aria-label="Tilt"
                className="min-w-0 flex-1 accent-primary"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
