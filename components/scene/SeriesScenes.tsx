"use client";

import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { SCENE_MAX_CHARS, SERIES_MAX, SERIES_MIN } from "@/lib/series/scenes";

const chip = (on: boolean) =>
  `rounded-md border px-2 py-1 text-xs transition-colors ${
    on
      ? "border-primary text-primary"
      : "border-border text-muted-foreground hover:text-foreground"
  }`;

/** The scene lines — drafted by Claude, then the user's to edit, add to or cut. */
export function SeriesScenes({
  scenes,
  count,
  planning,
  disabled,
  onCount,
  onChange,
  onPlan,
}: {
  scenes: string[];
  count: number;
  planning: boolean;
  disabled?: boolean;
  onCount: (n: number) => void;
  onChange: (scenes: string[]) => void;
  onPlan: () => void;
}) {
  const set = (i: number, v: string) =>
    onChange(scenes.map((s, j) => (j === i ? v : s)));
  const counts = Array.from(
    { length: SERIES_MAX - SERIES_MIN + 1 },
    (_, i) => SERIES_MIN + i,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          The scenes
        </p>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[11px] text-muted-foreground">
            How many
          </span>
          {counts.map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onCount(n)}
              className={chip(count === n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onPlan}
        disabled={disabled || planning}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
      >
        {planning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {scenes.length ? "Suggest different scenes" : "Suggest scenes for me"}
        <span className="text-muted-foreground">· free</span>
      </button>

      {scenes.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-4 text-right text-[11px] tabular-nums text-muted-foreground">
            {i + 1}
          </span>
          <input
            value={s}
            maxLength={SCENE_MAX_CHARS}
            disabled={disabled}
            onChange={(e) => set(i, e.target.value)}
            placeholder="Where is it, and what's around it?"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary/60"
          />
          <button
            type="button"
            aria-label={`Remove scene ${i + 1}`}
            disabled={disabled}
            onClick={() => onChange(scenes.filter((_, j) => j !== i))}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {scenes.length < SERIES_MAX && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...scenes, ""])}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add a scene
        </button>
      )}
    </div>
  );
}
