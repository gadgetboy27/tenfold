"use client";

import { Lock } from "lucide-react";
import type { CompositionAspect } from "@/lib/composition/layers";
import { sizeLabel, type RenderScale } from "@/lib/composition/quality";

/**
 * Render quality: Standard (what social posts need) or High (2×, for print,
 * websites and YouTube — a Pro feature). Shows the real pixel size of each, so
 * "High" is a number the user can check against what they're making, not a
 * word. A locked High explains itself instead of silently doing nothing.
 */
export function QualityPicker({
  value,
  aspect,
  hdAllowed,
  disabled,
  onChange,
}: {
  value: RenderScale;
  aspect: CompositionAspect;
  hdAllowed: boolean;
  disabled?: boolean;
  onChange: (scale: RenderScale) => void;
}) {
  const chip = (on: boolean) =>
    `rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-60 ${
      on
        ? "border-primary text-primary"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div
      role="group"
      aria-label="Render quality"
      className="flex items-center gap-1"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(1)}
        className={chip(value === 1)}
        title="What social platforms use — they recompress to about 1080p"
      >
        Standard · {sizeLabel(aspect, 1)}
      </button>
      <button
        type="button"
        disabled={disabled || !hdAllowed}
        onClick={() => onChange(2)}
        className={chip(value === 2)}
        title={
          hdAllowed
            ? "Sharper text, stickers and logos — for print, websites and YouTube"
            : "High quality is a Pro feature"
        }
      >
        {!hdAllowed && <Lock className="mr-1 inline h-3 w-3" />}
        High · {sizeLabel(aspect, 2)}
        {!hdAllowed && " · Pro"}
      </button>
    </div>
  );
}
