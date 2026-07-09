import { z } from "zod";

/**
 * Layered-compositor data model — single source of truth, shared by the client
 * canvas preview and the server FFmpeg export (docs/tenfold-compositor-brief.md §3).
 *
 * Everything here must stay JSON-serialisable (rows live in
 * compositions.background / compositions.layers jsonb) and free of node/browser
 * imports so both sides can use it.
 */

// ── Aspect / design space ────────────────────────────────────────────────────
// Layer coordinates are in DESIGN-SPACE PIXELS fixed per aspect, so a saved
// composition renders identically on a scaled-down preview canvas and in the
// full-resolution server export.

export type CompositionAspect = "9:16" | "1:1" | "16:9";

export const ASPECT_DESIGN: Record<
  CompositionAspect,
  { width: number; height: number }
> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

/** Map an aspect onto the existing compositions.format column (and back). */
export const ASPECT_TO_FORMAT: Record<CompositionAspect, string> = {
  "9:16": "story",
  "1:1": "square",
  "16:9": "landscape",
};

export function formatToAspect(format: string): CompositionAspect {
  switch (format) {
    case "story":
    case "reel":
    case "portrait":
      return "9:16";
    case "landscape":
      return "16:9";
    default:
      return "1:1";
  }
}

// ── Blend modes ──────────────────────────────────────────────────────────────
// Curated to modes the canvas 2D API and FFmpeg's blend/overlay filters render
// identically, so the preview never lies about the export (audit deviation #2).

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "lighten"
  | "darken";

export interface BlendModeMeta {
  id: BlendMode;
  /** Plain-English label for the UI dropdown. */
  label: string;
  /** canvas globalCompositeOperation equivalent. */
  canvas: GlobalCompositeOperation;
  /** FFmpeg blend filter all_mode equivalent (normal uses plain overlay). */
  ffmpeg: string;
}

export const BLEND_MODES: BlendModeMeta[] = [
  {
    id: "normal",
    label: "Normal — solid sticker",
    canvas: "source-over",
    ffmpeg: "normal",
  },
  {
    id: "screen",
    label: "Screen — glow on dark",
    canvas: "screen",
    ffmpeg: "screen",
  },
  {
    id: "multiply",
    label: "Multiply — ink on light",
    canvas: "multiply",
    ffmpeg: "multiply",
  },
  {
    id: "overlay",
    label: "Overlay — punchy contrast",
    canvas: "overlay",
    ffmpeg: "overlay",
  },
  {
    id: "lighten",
    label: "Lighten — keep the bright",
    canvas: "lighten",
    ffmpeg: "lighten",
  },
  {
    id: "darken",
    label: "Darken — keep the shadow",
    canvas: "darken",
    ffmpeg: "darken",
  },
];

export function blendToCanvas(blend: BlendMode): GlobalCompositeOperation {
  return BLEND_MODES.find((b) => b.id === blend)?.canvas ?? "source-over";
}

// ── Layers ───────────────────────────────────────────────────────────────────

const BRAND_FONTS = [
  "Inter",
  "Montserrat",
  "Playfair Display",
  "Lora",
  "Roboto",
] as const;

const blendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "lighten",
  "darken",
]);

// ── Effect kinds ─────────────────────────────────────────────────────────────
// Implementations live in lib/composition/effects.ts; the kind enums live here
// so the schema owns the shape and imports stay one-directional.

export const effectInKindSchema = z.enum([
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "slide-top",
  "slide-bottom",
  "slide-tl",
  "slide-tr",
  "slide-bl",
  "slide-br",
  "drop",
  "bounce",
  "rise",
  "rotate",
  "spin",
  "walk-left",
  "walk-right",
  "kick-left",
  "kick-right",
  "kick-up",
  "overshoot",
  "swing",
  "flash",
]);
export const effectOutKindSchema = z.enum([
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "slide-top",
  "slide-bottom",
  "drop-away",
  "sink",
  "spin",
  "kick",
  "flash",
]);
export const effectLoopKindSchema = z.enum([
  "none",
  "float",
  "sway",
  "shimmer",
]);

export type EffectInKind = z.infer<typeof effectInKindSchema>;
export type EffectOutKind = z.infer<typeof effectOutKindSchema>;
export type EffectLoopKind = z.infer<typeof effectLoopKindSchema>;

export const layerEffectsSchema = z.object({
  in: z.object({
    kind: effectInKindSchema.default("none"),
    durationSec: z.number().min(0.1).max(5).default(0.8),
  }),
  out: z.object({
    kind: effectOutKindSchema.default("none"),
    durationSec: z.number().min(0.1).max(5).default(0.8),
  }),
  loop: effectLoopKindSchema.default("none"),
});

export type LayerEffects = z.infer<typeof layerEffectsSchema>;

const layerBaseSchema = z.object({
  id: z.string().min(1),
  /** Design-space pixel coords of the layer centre (see ASPECT_DESIGN). */
  x: z.number(),
  y: z.number(),
  scale: z.number().positive().max(20).default(1),
  rotationDeg: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  blend: blendModeSchema.default("normal"),
  /** Seconds on the master clock. */
  appearAt: z.number().min(0).default(0),
  /** null = visible until the end of the clip (Infinity isn't JSON-safe). */
  disappearAt: z.number().positive().nullable().default(null),
  /** Legacy fade duration — superseded by `effects`; old saved layers map
   *  fadeSec onto fade in/out via effectsOf() in effects.ts. */
  fadeSec: z.number().min(0).max(10).default(0),
  /** Entrance / exit / ambient animation (the effects suite). */
  effects: layerEffectsSchema.optional(),
});

export const imageLayerSchema = layerBaseSchema.extend({
  kind: z.literal("image"),
  /** Storage URL. Drawn with drawImage only — never through a model. */
  src: z.string().url(),
});

export const textLayerSchema = layerBaseSchema.extend({
  kind: z.literal("text"),
  text: z.string().min(1).max(500),
  font: z.enum(BRAND_FONTS).default("Inter"),
  sizePx: z.number().min(8).max(400).default(64),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
});

export const layerSchema = z.discriminatedUnion("kind", [
  imageLayerSchema,
  textLayerSchema,
]);

export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;

// ── Composition document ─────────────────────────────────────────────────────

export const backgroundSchema = z.object({
  kind: z.enum(["video", "image"]),
  src: z.string().url(),
  /** Known clip length; images use a virtual clock of this many seconds. */
  durationSec: z.number().positive().max(600).optional(),
});

export type CompositionBackground = z.infer<typeof backgroundSchema>;

/** The editable document (row id + persisted jsonb columns). */
export const compositionDocSchema = z.object({
  id: z.string().uuid(),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  background: backgroundSchema,
  /** Render order: index 0 draws first (back), last draws on top (front). */
  layers: z.array(layerSchema).max(20),
});

export type CompositionDoc = z.infer<typeof compositionDocSchema>;

/**
 * Visibility × fade envelope for a layer at time t (0..1 alpha multiplier).
 * Fade-out only applies when the layer has an explicit disappearAt — a layer
 * running to the end of the clip (null) holds at full alpha, so end-card
 * logos fade in and stay.
 */
export function layerAlphaAt(
  layer: Layer,
  t: number,
  clipDurationSec: number,
): number {
  const start = layer.appearAt;
  const end = layer.disappearAt ?? clipDurationSec;
  if (t < start || t > end) return 0;
  let alpha = 1;
  if (layer.fadeSec > 0) {
    alpha = Math.min(alpha, (t - start) / layer.fadeSec);
    if (layer.disappearAt !== null) {
      alpha = Math.min(alpha, (end - t) / layer.fadeSec);
    }
  }
  return Math.min(1, Math.max(0, alpha)) * layer.opacity;
}
