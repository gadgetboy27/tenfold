"use client";

import { useMemo } from "react";
import { Clapperboard } from "lucide-react";
import {
  REVEAL_ENDS,
  REVEAL_MODES,
  type RevealEnd,
  type RevealMode,
  type TextLayer,
  type TextReveal,
} from "@/lib/composition/layers";
import { revealTimes, revealUnitCount } from "@/lib/composition/reveal";
import { useCompositorStore } from "@/store/useCompositorStore";
import { setTextReveal } from "./adBridge";

const MODE_LABEL: Record<RevealMode, string> = {
  typewriter: "Typewriter",
  words: "Word by word",
  karaoke: "Karaoke",
};
const MODE_HINT: Record<RevealMode, string> = {
  typewriter: "Types out letter by letter.",
  words: "Each word pops in as it's read.",
  karaoke: "All the words show dimmed and light up as they're read.",
};
const END_LABEL: Record<RevealEnd, string> = {
  none: "Nothing",
  flash: "Flash",
  bump: "Bump",
  pulse: "Pulse",
  shake: "Shake",
};

/** ~0.4s a word reads naturally; never less than 2s so short text still lands. */
function defaultDuration(text: string): number {
  const words = revealUnitCount(text, "words");
  return Math.min(30, Math.max(2, Math.round(words * 0.4 * 2) / 2));
}

/**
 * "Read it out" — the selected text fills its box over time, karaoke-style,
 * then does something when it finishes. Timing is relative to when the text
 * appears on the ad. Follows the stage selection like the type pickers do.
 */
export function RevealCard({ target }: { target: TextLayer | null }) {
  const reveal = target?.reveal;
  const text = target?.text ?? "";
  const fallbackSec = useMemo(() => defaultDuration(text), [text]);
  const clipSec = useCompositorStore(
    (s) => s.doc?.background.durationSec ?? 10,
  );

  if (!target) return null;

  const set = (patch: Partial<TextReveal> & { mode?: RevealMode }) => {
    const base: TextReveal = reveal ?? {
      mode: "karaoke",
      delaySec: 0,
      durationSec: fallbackSec,
      holdSec: 0,
      end: "none",
    };
    // Widths are re-measured at export; never carry stale ones across edits.
    setTextReveal(target.id, { ...base, ...patch, lineWidths: undefined });
  };

  const chip = (on: boolean) =>
    `rounded-md border px-2 py-1 text-xs transition-colors ${
      on
        ? "border-primary text-primary"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ) => (
    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-9 text-right tabular-nums text-foreground">
        {value.toFixed(step < 1 ? 1 : 0)}s
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Clapperboard className="h-4 w-4" /> Read it out
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The words fill the box as they&apos;re read, then finish with an
          effect. Press play on the stage to watch — while paused you see the
          finished text so you can place it.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setTextReveal(target.id, null)}
          className={chip(!reveal)}
        >
          Off
        </button>
        {REVEAL_MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => set({ mode: m })}
            className={chip(reveal?.mode === m)}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {reveal && (
        <>
          <p className="text-[11px] text-muted-foreground">
            {MODE_HINT[reveal.mode]}
          </p>
          {slider("Wait first", reveal.delaySec, 0, 5, 0.5, (v) =>
            set({ delaySec: v }),
          )}
          {slider("Read over", reveal.durationSec, 1, 30, 0.5, (v) =>
            set({ durationSec: v }),
          )}
          <label className="text-[11px] text-muted-foreground">
            When it finishes
          </label>
          <div className="flex flex-wrap gap-1">
            {REVEAL_ENDS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => set({ end: e })}
                className={chip(reveal.end === e)}
              >
                {END_LABEL[e]}
              </button>
            ))}
          </div>
          {revealTimes(target.appearAt, reveal).readEnd > clipSec && (
            <p className="text-[11px] text-amber-500">
              The ad is only {clipSec}s long, so the reading gets cut off —
              shorten the wait or the read time.
            </p>
          )}
          {reveal.end !== "none" &&
            slider("Pause before", reveal.holdSec, 0, 5, 0.5, (v) =>
              set({ holdSec: v }),
            )}
        </>
      )}
    </div>
  );
}
