"use client";

import { Wand2 } from "lucide-react";
import {
  CAMERAS,
  LOOKS,
  type BackdropTreatment,
} from "@/lib/composition/layers";
import {
  CAMERA_LABEL,
  LOOK_LABEL,
  NEUTRAL_TREATMENT,
} from "@/lib/composition/treatment";
import { useCompositorStore } from "@/store/useCompositorStore";
import { chip } from "./StyleRows";

/**
 * Look & motion — what the BACKDROP looks like and how the camera moves over
 * it: a colour look, grain, a vignette, a slow zoom or drift, and a pulse on a
 * steady beat. Layers (text, stickers, logo) sit on top untouched. A camera
 * move makes even a still photo into a moving ad, with no generation cost.
 * Applies to the preview, the exported video and (look/grain/vignette) a photo
 * post. The pulse is set by BPM — it does not listen to the music.
 */
export function BackdropFxCard() {
  const treatment = useCompositorStore((s) => s.doc?.background.treatment);
  const setTreatment = useCompositorStore((s) => s.setTreatment);
  const hasDoc = useCompositorStore((s) => s.doc !== null);
  if (!hasDoc) return null;

  const t = treatment ?? NEUTRAL_TREATMENT;
  const set = (patch: Partial<BackdropTreatment>) =>
    setTreatment({ ...t, ...patch });

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    fmt: (v: number) => string,
  ) => (
    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-primary"
      />
      <span className="w-12 text-right tabular-nums text-foreground">
        {fmt(value)}
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4" /> Look &amp; motion
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Colour and camera for the backdrop — your text and stickers stay as
            they are. Press play on the stage to see movement.
          </p>
        </div>
        {treatment && (
          <button
            type="button"
            onClick={() => setTreatment(undefined)}
            className="shrink-0 text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      <label className="text-[11px] text-muted-foreground">Look</label>
      <div className="flex flex-wrap gap-1">
        {LOOKS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => set({ look: l })}
            className={chip(t.look === l)}
          >
            {LOOK_LABEL[l]}
          </button>
        ))}
      </div>
      {slider(
        "Film grain",
        t.grain,
        0,
        1,
        0.05,
        (grain) => set({ grain }),
        (v) => `${Math.round(v * 100)}%`,
      )}
      {slider(
        "Vignette",
        t.vignette,
        0,
        1,
        0.05,
        (vignette) => set({ vignette }),
        (v) => `${Math.round(v * 100)}%`,
      )}

      <label className="text-[11px] text-muted-foreground">Camera</label>
      <div className="flex flex-wrap gap-1">
        {CAMERAS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set({ camera: c })}
            className={chip(t.camera === c)}
          >
            {CAMERA_LABEL[c]}
          </button>
        ))}
      </div>
      {t.camera !== "none" &&
        slider(
          "Amount",
          t.cameraAmount,
          0.05,
          0.4,
          0.01,
          (cameraAmount) => set({ cameraAmount }),
          (v) => `${Math.round(v * 100)}%`,
        )}

      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={!!t.pulse}
          onChange={(e) =>
            set({
              pulse: e.target.checked
                ? { bpm: 120, strength: 0.05 }
                : undefined,
            })
          }
        />
        Pulse on the beat (set the tempo yourself)
      </label>
      {t.pulse && (
        <>
          {slider(
            "Tempo",
            t.pulse.bpm,
            60,
            180,
            1,
            (bpm) => set({ pulse: { ...t.pulse!, bpm } }),
            (v) => `${v} bpm`,
          )}
          {slider(
            "Strength",
            t.pulse.strength,
            0.01,
            0.15,
            0.01,
            (strength) => set({ pulse: { ...t.pulse!, strength } }),
            (v) => `${Math.round(v * 100)}%`,
          )}
        </>
      )}
    </div>
  );
}
