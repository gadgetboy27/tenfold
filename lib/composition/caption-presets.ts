import {
  ASPECT_DESIGN,
  CAPTION_LAYER_ID,
  type CompositionAspect,
  type Layer,
} from "@/lib/composition/layers";
import { wrapText } from "@/lib/composition/brand-apply";

export { CAPTION_LAYER_ID };

/**
 * The caption presets — the single source of truth, and deliberately free of
 * any node imports so client components can read it.
 *
 * This module exists because there was no client-safe home for the list:
 * lib/composition/video.ts imports node:child_process for FFmpeg, so Step 4
 * carried a hand-copied mirror of these four entries with a comment explaining
 * why. Two lists, one meaning. video.ts now imports from here and keeps only
 * its drawtext filters.
 *
 * `captionPresetLayer` is the other half: it expresses each preset as a
 * compositor text layer, so "cinema mix" is a preset inside the compositor
 * rather than a second, parallel render pipeline.
 */

export type CaptionStyle = "none" | "fade" | "lower_third" | "crawl";

export interface CaptionPreset {
  id: CaptionStyle;
  label: string;
  blurb: string;
  proOnly: boolean;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "none",
    label: "No caption",
    blurb: "Video + music only.",
    proOnly: false,
  },
  {
    id: "fade",
    label: "Fade",
    blurb: "Caption fades in and out, centred lower.",
    proOnly: false,
  },
  {
    id: "lower_third",
    label: "Lower third",
    blurb: "Broadcast-style caption bar.",
    proOnly: true,
  },
  {
    id: "crawl",
    label: "Cinematic crawl",
    blurb: "Epic text scrolling up the frame, cinema-title style.",
    proOnly: true,
  },
];

export function isProCaptionStyle(style: CaptionStyle): boolean {
  return CAPTION_PRESETS.find((p) => p.id === style)?.proOnly ?? false;
}

/** The cinema-title yellow the crawl preset has always used (0xFFE81F). */
const CRAWL_YELLOW = "#ffe81f";

/**
 * Express a preset as a compositor text layer, mirroring the FFmpeg preset it
 * replaces (lib/composition/video.ts `captionFilter`):
 *
 *  - fade        black scrim @0.45, low-centre, fades in and out
 *  - lower_third black scrim @0.55, left-aligned near the bottom
 *  - crawl       cinema yellow, no scrim, travels bottom → top over the clip
 *  - none        no layer at all
 *
 * The scrims are why the text layer grew a `bg`: without one, `fade` and
 * `lower_third` are unreadable over bright footage — which is the entire
 * reason drawtext drew a box in the first place.
 *
 * Returns null for `none`, or when there's no caption text to place.
 */
export function captionPresetLayer(
  style: CaptionStyle,
  opts: {
    text: string;
    aspect: CompositionAspect;
    clipDurationSec: number;
    id?: string;
  },
): Layer | null {
  const text = opts.text.trim();
  if (style === "none" || !text) return null;

  const design = ASPECT_DESIGN[opts.aspect];
  const id = opts.id ?? CAPTION_LAYER_ID;
  const dur = Math.max(1, opts.clipDurationSec);

  const base = {
    id,
    kind: "text" as const,
    font: "Inter" as const,
    scale: 1,
    rotationDeg: 0,
    opacity: 1,
    blend: "normal" as const,
    appearAt: 0,
    disappearAt: null,
    fadeSec: 0,
  };

  if (style === "crawl") {
    // Enter from below over the first half, exit past the top over the second:
    // together they trace the single bottom-to-top sweep that drawtext does
    // with y=h-(h+th)*t/dur. Halving the clip is what keeps it moving the whole
    // time rather than arriving early and sitting still.
    const half = Math.min(5, Math.max(0.1, dur / 2));
    return {
      ...base,
      text: wrapText(text, 24),
      sizePx: Math.round(design.width / 15),
      color: CRAWL_YELLOW,
      align: "center",
      pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
      effects: {
        in: { kind: "slide-bottom", durationSec: half },
        out: { kind: "slide-top", durationSec: half },
        loop: "none",
      },
    };
  }

  if (style === "lower_third") {
    return {
      ...base,
      text: wrapText(text, 30),
      sizePx: Math.round(design.width / 20),
      color: "#ffffff",
      align: "left",
      pos: { mode: "anchor", anchor: "bottom-left", mx: 0.05, my: 0.07 },
      bg: { color: "#000000", opacity: 0.55, padPx: 16 },
      effects: {
        in: { kind: "slide-left", durationSec: 0.6 },
        out: { kind: "none", durationSec: 0.8 },
        loop: "none",
      },
    };
  }

  // fade
  return {
    ...base,
    text: wrapText(text, 26),
    sizePx: Math.round(design.width / 18),
    color: "#ffffff",
    align: "center",
    pos: { mode: "fraction", nx: 0.5, ny: 0.84 },
    bg: { color: "#000000", opacity: 0.45, padPx: 20 },
    effects: {
      in: { kind: "fade", durationSec: 0.8 },
      out: { kind: "fade", durationSec: 0.8 },
      loop: "none",
    },
  };
}
