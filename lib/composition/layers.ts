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

// ── Position (aspect-independent) ────────────────────────────────────────────
// A layer stores its position RELATIVE to the canvas, not in absolute pixels,
// so one master composition reflows to every aspect automatically
// (docs/multiformat-manifesto.md §4). resolveCenter() turns a pos into
// design-space centre pixels for a given aspect; centerToPos() is the inverse.

export type LayerAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

const layerAnchorSchema = z.enum([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);

/**
 * Fraction mode: the layer CENTRE as 0..1 of the canvas width/height — floats
 * with the frame, used for captions and free art.
 * Anchor mode: pinned to an edge/corner; margin (mx/my) is an inward inset as a
 * fraction of the canvas MIN dimension (a constant 1080 across every aspect, so
 * the inset is a stable pixel distance) — used for logos and brand marks.
 */
export const layerPositionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("fraction"),
    nx: z.number(),
    ny: z.number(),
  }),
  z.object({
    mode: z.literal("anchor"),
    anchor: layerAnchorSchema,
    mx: z.number().min(0).default(0.04),
    my: z.number().min(0).default(0.04),
  }),
]);

export type LayerPosition = z.infer<typeof layerPositionSchema>;

const LEFT_ANCHORS: readonly LayerAnchor[] = [
  "top-left",
  "left",
  "bottom-left",
];
const RIGHT_ANCHORS: readonly LayerAnchor[] = [
  "top-right",
  "right",
  "bottom-right",
];
const TOP_ANCHORS: readonly LayerAnchor[] = ["top-left", "top", "top-right"];
const BOTTOM_ANCHORS: readonly LayerAnchor[] = [
  "bottom-left",
  "bottom",
  "bottom-right",
];

/** Which edge each axis of an anchor pins to — shared by the canvas resolver
 *  and the FFmpeg export so preview and MP4 place anchors identically. */
export function anchorAxes(anchor: LayerAnchor): {
  h: "left" | "center" | "right";
  v: "top" | "middle" | "bottom";
} {
  return {
    h: LEFT_ANCHORS.includes(anchor)
      ? "left"
      : RIGHT_ANCHORS.includes(anchor)
        ? "right"
        : "center",
    v: TOP_ANCHORS.includes(anchor)
      ? "top"
      : BOTTOM_ANCHORS.includes(anchor)
        ? "bottom"
        : "middle",
  };
}

/** pos → design-space centre pixels for `aspect`. halfW/halfH are the layer's
 *  scaled half-size (only used by anchor mode, to keep its box inside the edge
 *  inset). NOTE: pass the *un-rotated* half-size; rotated anchor layers need the
 *  rotated bounding box to stay in lockstep with the FFmpeg export — deferred to
 *  the Phase 3 pin UI (docs/multiformat-manifesto.md §6). */
export function resolveCenter(
  pos: LayerPosition,
  aspect: CompositionAspect,
  halfW: number,
  halfH: number,
): { x: number; y: number } {
  const { width: W, height: H } = ASPECT_DESIGN[aspect];
  if (pos.mode === "fraction") {
    return { x: pos.nx * W, y: pos.ny * H };
  }
  const m = Math.min(W, H);
  const Mx = pos.mx * m;
  const My = pos.my * m;
  const x = LEFT_ANCHORS.includes(pos.anchor)
    ? Mx + halfW
    : RIGHT_ANCHORS.includes(pos.anchor)
      ? W - Mx - halfW
      : W / 2;
  const y = TOP_ANCHORS.includes(pos.anchor)
    ? My + halfH
    : BOTTOM_ANCHORS.includes(pos.anchor)
      ? H - My - halfH
      : H / 2;
  return { x, y };
}

/** Inverse of resolveCenter — mode-preserving. Dragging a fraction layer
 *  rewrites its fraction; dragging an anchor layer recomputes the margins of
 *  its anchored edges (centre-anchored axes hold their prior margin). */
export function centerToPos(
  prev: LayerPosition,
  x: number,
  y: number,
  aspect: CompositionAspect,
  halfW: number,
  halfH: number,
): LayerPosition {
  const { width: W, height: H } = ASPECT_DESIGN[aspect];
  if (prev.mode === "fraction") {
    return { mode: "fraction", nx: x / W, ny: y / H };
  }
  const m = Math.min(W, H);
  const mx = LEFT_ANCHORS.includes(prev.anchor)
    ? Math.max(0, (x - halfW) / m)
    : RIGHT_ANCHORS.includes(prev.anchor)
      ? Math.max(0, (W - x - halfW) / m)
      : prev.mx;
  const my = TOP_ANCHORS.includes(prev.anchor)
    ? Math.max(0, (y - halfH) / m)
    : BOTTOM_ANCHORS.includes(prev.anchor)
      ? Math.max(0, (H - y - halfH) / m)
      : prev.my;
  return { mode: "anchor", anchor: prev.anchor, mx, my };
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
  /** Aspect-independent position; resolveCenter() maps it to design pixels. */
  pos: layerPositionSchema,
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

/**
 * Upgrade a raw (possibly legacy) doc in place-safe fashion: a layer that still
 * carries absolute `x, y` (authored before the aspect-independent model) gets a
 * fraction `pos` derived from the doc's aspect, reproducing the same pixel
 * centre. Idempotent — layers that already have `pos` pass straight through.
 */
export function migrateDocInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const doc = raw as Record<string, unknown>;
  const aspect = doc.aspect;
  if (!Array.isArray(doc.layers) || typeof aspect !== "string") return raw;
  const design = ASPECT_DESIGN[aspect as CompositionAspect];
  if (!design) return raw;
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (!l || typeof l !== "object") return l;
      const layer = l as Record<string, unknown>;
      if (layer.pos !== undefined) return layer;
      if (typeof layer.x !== "number" || typeof layer.y !== "number")
        return layer;
      const { x, y, ...rest } = layer;
      return {
        ...rest,
        pos: {
          mode: "fraction",
          nx: (x as number) / design.width,
          ny: (y as number) / design.height,
        },
      };
    }),
  };
}

/** The editable document (row id + persisted jsonb columns). */
export const compositionDocSchema = z.preprocess(
  migrateDocInput,
  z.object({
    id: z.string().uuid(),
    aspect: z.enum(["9:16", "1:1", "16:9"]),
    background: backgroundSchema,
    /** Render order: index 0 draws first (back), last draws on top (front). */
    layers: z.array(layerSchema).max(20),
  }),
);

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
