import type { LogoBrief, ColorDirection } from "@/lib/logo/brief";

/**
 * Brief → Recraft prompt. Pure, no AI call — the intelligence is in the model;
 * this just phrases the request the way Recraft responds to best (specific over
 * vague, any literal text in quotes).
 *
 * Verified against fal's V4.1 text-to-vector schema: it has NO `style` param
 * (it's inherently vector) and NO `num_images` — so this returns the prompt
 * plus an optional `colors` palette, and the caller fans out N separate calls.
 */

/** RGB for the Recraft `colors` param. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const hex = (h: string): RgbColor => ({
  r: parseInt(h.slice(0, 2), 16),
  g: parseInt(h.slice(2, 4), 16),
  b: parseInt(h.slice(4, 6), 16),
});

/** A small, named palette per colour direction. "auto" → no palette. */
const PALETTES: Record<Exclude<ColorDirection, "auto">, RgbColor[]> = {
  monochrome: [hex("111111"), hex("888888")],
  bold: [hex("e63946"), hex("1d3557")],
  earthy: [hex("6b705c"), hex("cb997e")],
  pastel: [hex("a8dadc"), hex("f1c0e8")],
  vibrant: [hex("ff006e"), hex("3a86ff"), hex("ffbe0b")],
};

/** Pick a descriptive word from a 0–100 axis, or "" near the midpoint. */
function axis(value: number, low: string, high: string): string {
  if (value <= 35) return low;
  if (value >= 65) return high;
  return "";
}

/** What the logo type asks the model to produce. */
const TYPE_CLAUSE: Record<LogoBrief["logoType"], (name: string) => string> = {
  wordmark: (n) => `wordmark logo, the text reads exactly "${n}", spelled correctly, distinctive custom lettering, no separate icon`,
  icon: () => `a single abstract icon mark, no text, bold memorable silhouette`,
  combination: (n) => `an icon paired with the name "${n}" in a clean sans-serif`,
  emblem: (n) => `an emblem badge containing the name "${n}", symmetrical crest`,
};

export interface ComposedLogoPrompt {
  prompt: string;
  /** Undefined when colour direction is "auto". */
  colors?: RgbColor[];
}

export function composeLogoPrompt(brief: LogoBrief): ComposedLogoPrompt {
  const p = brief.personality;
  const descriptors = [
    axis(p.classicModern, "classic, timeless", "modern, contemporary"),
    axis(p.playfulSerious, "playful, friendly", "serious, professional"),
    axis(p.minimalDetailed, "minimalist, simple", "detailed, intricate"),
    axis(p.warmCool, "warm, inviting", "cool, precise"),
  ].filter(Boolean);

  const parts = [
    TYPE_CLAUSE[brief.logoType](brief.businessName.trim()),
    brief.industry.trim() ? `for a ${brief.industry.trim()} business` : "",
    descriptors.join(", "),
    brief.notes.trim(),
    // The spine — flat vector logo, centred, reproducible.
    "professional brand logo, flat vector, centred, clean, high contrast, scalable, iconic, on a plain background",
  ].filter(Boolean);

  const composed: ComposedLogoPrompt = { prompt: parts.join(", ") };
  if (brief.colorDirection !== "auto") {
    composed.colors = PALETTES[brief.colorDirection];
  }
  return composed;
}

/** A refine instruction: the user's "more like this" tweak over the anchor. */
export function composeRefinePrompt(instruction: string): string {
  const t = instruction.trim();
  return t
    ? `${t}, keep it a clean flat vector logo on a plain background`
    : "refine and clean up, keep it a flat vector logo on a plain background";
}
