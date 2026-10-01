"use client";

import { weightsFor } from "@/lib/composition/layers";

/**
 * The small controls every kind of lettering shares — a face, a weight, a
 * colour. They live here once so the toolbox has ONE copy of each instead of a
 * font list for Words, another for the caption and a third for stickers.
 */
export const chip = (on: boolean) =>
  `rounded-md border px-2 py-1 text-xs transition-colors ${
    on
      ? "border-primary text-primary"
      : "border-border text-muted-foreground hover:text-foreground"
  }`;

export function FontRow({
  fonts,
  value,
  onPick,
}: {
  fonts: readonly string[];
  value: string;
  onPick: (font: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {fonts.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onPick(f)}
          style={{ fontFamily: `"${f}", sans-serif` }}
          className={chip(value === f)}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

export function WeightRow({
  font,
  value,
  onPick,
}: {
  font: string;
  value: 400 | 700;
  onPick: (weight: 400 | 700) => void;
}) {
  const weights = weightsFor(font);
  // A display face has one cut — nothing to choose, so don't offer a choice.
  if (weights.length < 2) return null;
  return (
    <div className="flex gap-1">
      {weights.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onPick(w)}
          style={{ fontFamily: `"${font}", sans-serif`, fontWeight: w }}
          className={chip(value === w)}
        >
          {w === 700 ? "Bold" : "Regular"}
        </button>
      ))}
    </div>
  );
}

export function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      {/* onInput, not only onChange: a colour picker's `change` fires when the
          dialog closes, which is the opposite of live. */}
      <input
        type="color"
        value={value}
        onInput={(e) => onChange(e.currentTarget.value)}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="h-7 w-10 cursor-pointer rounded border border-border bg-background"
      />
    </label>
  );
}
