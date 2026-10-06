import { z } from "zod";

/**
 * Pixel effects — animations that change a layer's PIXELS over time (it
 * crumbles, gets sliced, is struck by lightning), as opposed to the layer
 * effects suite (effects.ts) which only moves, scales or fades a layer whole.
 *
 * General by design: nothing in lib/composition/fx knows what a sticker is. An
 * effect takes the size of a still picture and a progress, and returns a SCENE
 * — a plain description of what to draw. Today only the Sticker section
 * attaches one (`stickerSpecSchema.fx`); attaching it to another kind of layer
 * later means adding a field and a call site, not touching the effects.
 */

export const PIXEL_FX_KINDS = [
  "crumble",
  "slice",
  "dust",
  "electric",
  "glitch",
  "shine",
] as const;
export type PixelFxKind = (typeof PIXEL_FX_KINDS)[number];

/** Transitions only: break apart ("out") or assemble ("in"). */
export const PIXEL_FX_MODES = ["out", "in"] as const;
export type PixelFxMode = (typeof PIXEL_FX_MODES)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * `startPct` is a PERCENTAGE of the clip, not a time: the user doesn't know
 * whether the ad will run 10, 15 or 30 seconds, and "at 3s" means something
 * different on each. It is resolved to seconds against the real clip length
 * (timing.ts) in the preview and, for a video background, at export.
 */
export const pixelFxSchema = z.object({
  kind: z.enum(PIXEL_FX_KINDS),
  startPct: z.number().min(0).max(100).default(40),
  /** How long one run of the effect lasts, in seconds. */
  lengthSec: z.number().min(0.3).max(3).default(1.2),
  mode: z.enum(PIXEL_FX_MODES).default("out"),
  /** Pulses only (electric / glitch / shine): how many times it runs. */
  repeat: z.number().int().min(1).max(5).default(1),
  /** Strength multiplier — scatter, spin, reach, bolt count. */
  intensity: z.number().min(0.5).max(2).default(1),
  /** Bolts, the slice flash, the glint. Absent = the effect's own default. */
  color: hex.optional(),
});
export type PixelFx = z.infer<typeof pixelFxSchema>;

export type Pt = [number, number];

/**
 * One piece of the picture: a rectangle of the source, moved, turned, scaled
 * and faded. Everything is relative to the SOURCE picture's own top-left, in
 * its own pixels. `dx`/`dy` move the piece's centre from where it started;
 * `rot` turns it (radians) about that centre.
 */
export interface FxPiece {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  rot: number;
  scale: number;
  alpha: number;
  /** Only the part inside this polygon (source-rect-local px) is drawn. */
  clip?: Pt[];
  /** Fill the piece's shape with one colour, keeping its alpha. */
  colorize?: string;
  /** Add to what's underneath instead of covering it (glows, ghosts). */
  add?: boolean;
}

/** A stroked line. Halos are several of these stacked, not a blur — so the
 *  canvas and the server draw the same thing without a shared blur filter. */
export interface FxBolt {
  pts: Pt[];
  width: number;
  alpha: number;
  color: string;
}

/** A soft band of colour that crosses the picture, drawn only where the
 *  pictured thing is (atop) — the glint on a shiny letter. */
export interface FxSweep {
  /** Centre of the band along x at the picture's middle row, source px. */
  cx: number;
  /** Band width, source px. */
  width: number;
  /** Lean of the band from vertical, radians. */
  angle: number;
  alpha: number;
  color: string;
}

export interface FxScene {
  pieces: FxPiece[];
  /** Lighten the picture itself (atop) — the white-hot flash of a strike. */
  wash?: { color: string; alpha: number };
  sweep?: FxSweep;
  /** Drawn last, over everything. */
  bolts: FxBolt[];
}

/** Everything an effect needs besides the progress. */
export interface FxCtx {
  /** Source picture size, px. */
  w: number;
  h: number;
  /** Stable per picture, so a re-render draws the same dust and cracks. */
  seed: number;
  color: string;
  intensity: number;
  mode: PixelFxMode;
  lengthSec: number;
  /** Room around the picture the scene may use (offsets are clamped to it). */
  mx: number;
  my: number;
}
