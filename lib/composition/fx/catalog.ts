import type { PixelFx, PixelFxKind, PixelFxMode } from "./types";

/**
 * What each effect IS, for the UI and for the timing rules. Two families:
 *
 *  transition — the picture goes from whole to gone ("out") or from gone to
 *               whole ("in"). It is not there on one side of the effect.
 *  pulse      — a moment of disturbance; the picture is whole before and after,
 *               so it can repeat.
 */
export type FxFamily = "transition" | "pulse";

export interface FxMeta {
  label: string;
  blurb: string;
  family: FxFamily;
  defaultLengthSec: number;
  defaultMode: PixelFxMode;
  /** null = the effect has no colour to choose. */
  defaultColor: string | null;
}

export const FX_META: Record<PixelFxKind, FxMeta> = {
  crumble: {
    label: "Crumble",
    blurb: "Cracks into tiles that tumble away.",
    family: "transition",
    defaultLengthSec: 1.4,
    defaultMode: "out",
    defaultColor: null,
  },
  slice: {
    label: "Slice",
    blurb: "A flash of a cut, then the pieces slide apart.",
    family: "transition",
    defaultLengthSec: 1,
    defaultMode: "out",
    defaultColor: "#ffffff",
  },
  dust: {
    label: "Dust",
    blurb: "Crumbles to grains that blow away.",
    family: "transition",
    defaultLengthSec: 1.6,
    defaultMode: "out",
    defaultColor: null,
  },
  electric: {
    label: "Electric",
    blurb: "Flickers while lightning arcs across it.",
    family: "pulse",
    defaultLengthSec: 1,
    defaultMode: "out",
    defaultColor: "#8be9ff",
  },
  glitch: {
    label: "Glitch",
    blurb: "Tears into shifting strips with colour fringes.",
    family: "pulse",
    defaultLengthSec: 0.7,
    defaultMode: "out",
    defaultColor: null,
  },
  shine: {
    label: "Shine",
    blurb: "A bright glint sweeps across the letters.",
    family: "pulse",
    defaultLengthSec: 0.9,
    defaultMode: "out",
    // Gold, not white: a white glint is invisible on white lettering.
    defaultColor: "#ffd86b",
  },
};

export function isPulse(kind: PixelFxKind): boolean {
  return FX_META[kind].family === "pulse";
}

/** A fresh effect with its own sensible length, placed 40% of the way in. */
export function defaultFx(kind: PixelFxKind): PixelFx {
  const m = FX_META[kind];
  return {
    kind,
    startPct: 40,
    lengthSec: m.defaultLengthSec,
    mode: m.defaultMode,
    repeat: 1,
    intensity: 1,
    ...(m.defaultColor ? { color: m.defaultColor } : {}),
  };
}

/** Switching effect keeps the user's timing and strength, takes the new
 *  effect's own length / colour / direction. */
export function switchFxKind(prev: PixelFx | undefined, kind: PixelFxKind) {
  const next = defaultFx(kind);
  return prev
    ? { ...next, startPct: prev.startPct, intensity: prev.intensity }
    : next;
}
