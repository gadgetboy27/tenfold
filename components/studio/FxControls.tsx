"use client";

import { resolveFxWindow } from "@/lib/composition/fx/timing";
import type { PixelFx } from "@/lib/composition/fx/types";

export const fxChip = (on: boolean) =>
  `rounded-md border px-2 py-1 text-xs transition-colors ${
    on
      ? "border-primary text-primary"
      : "border-border text-muted-foreground hover:text-foreground"
  }`;

/**
 * Where the effect lands on the clip, as a percentage — the user can't know
 * whether the ad will run 10, 15 or 30 seconds, so the position is "40% of the
 * way through", and the seconds shown beside it are only what that means for
 * the clip as it stands. Drag anywhere on the bar.
 */
export function FxTimeline({
  fx,
  clipSec,
  onStart,
}: {
  fx: PixelFx;
  clipSec: number;
  onStart: (pct: number) => void;
}) {
  const win = resolveFxWindow(fx, clipSec);
  const left = (win.start / clipSec) * 100;
  const width = Math.max(1.5, ((win.end - win.start) / clipSec) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-7 rounded-md bg-muted focus-within:ring-2 focus-within:ring-primary/50">
        <div
          className="absolute inset-y-1 rounded bg-primary/70"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={fx.startPct}
          onChange={(e) => onStart(Number(e.target.value))}
          aria-label="When the effect starts, as a percentage of the video"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Start</span>
        <span className="tabular-nums text-foreground">
          {fx.startPct}% · about {win.start.toFixed(1)}s of {clipSec}s
        </span>
        <span>End</span>
      </div>
    </div>
  );
}

export function FxSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="w-20 shrink-0">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-10 text-right tabular-nums text-foreground">
        {props.value.toFixed(props.step < 1 ? 1 : 0)}
        {props.unit}
      </span>
    </label>
  );
}
