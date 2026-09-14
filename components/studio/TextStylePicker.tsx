"use client";

import { BRAND_FONTS, weightsFor } from "@/lib/composition/layers";
import type { TextStyle } from "./adBridge";

/**
 * The one row of type controls for the whole Wording tool. It knows nothing
 * about which layer it is styling — the panel decides that from what is
 * selected on the stage and hands the result here — which is what lets a
 * headline and a caption share it instead of each carrying a copy.
 */
export function TextStylePicker({
  style,
  onChange,
  legend,
}: {
  style: TextStyle;
  onChange: (patch: Partial<TextStyle>) => void;
  legend: string;
}) {
  const chip = (on: boolean) =>
    `rounded-md border px-2 py-1 text-xs transition-colors ${
      on
        ? "border-primary text-primary"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{legend}</p>

      <label className="text-[11px] text-muted-foreground">Font</label>
      <div className="flex flex-wrap gap-1">
        {BRAND_FONTS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() =>
              onChange({
                font: f,
                // Drop a Bold this family has no file for.
                weight: weightsFor(f).includes(style.weight)
                  ? style.weight
                  : 400,
              })
            }
            style={{ fontFamily: `"${f}", sans-serif` }}
            className={chip(style.font === f)}
          >
            {f}
          </button>
        ))}
      </div>

      <label className="text-[11px] text-muted-foreground">Weight</label>
      <div className="flex gap-1">
        {weightsFor(style.font).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onChange({ weight: w })}
            style={{ fontFamily: `"${style.font}", sans-serif`, fontWeight: w }}
            className={chip(style.weight === w)}
          >
            {w === 700 ? "Bold" : "Regular"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[11px] text-muted-foreground">Colour</label>
        {/* onInput, not only onChange: a colour picker's `change` fires when
            the dialog closes, which is the opposite of live. */}
        <input
          type="color"
          value={style.color}
          onInput={(e) => onChange({ color: e.currentTarget.value })}
          onChange={(e) => onChange({ color: e.currentTarget.value })}
          className="h-7 w-12 cursor-pointer rounded border border-border bg-background"
        />
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={style.scrim}
            onChange={(e) => onChange({ scrim: e.target.checked })}
          />
          Panel behind
        </label>
      </div>
    </div>
  );
}
