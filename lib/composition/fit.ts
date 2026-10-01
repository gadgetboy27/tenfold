import { ASPECT_DESIGN, type CompositionAspect } from "./layers";

/**
 * Keeping lettering inside the frame when the shape changes.
 *
 * A block laid out for 16:9 (1920 wide) is wider than a 9:16 frame (1080
 * wide), so switching shape pushed words off the screen. Everything here is
 * pure geometry — the caller supplies measured sizes — so the rule that
 * decides "outside" and "how much to shrink" can be tested without a canvas.
 */

/** Margin as a fraction of the SHORTER side, so it is the same number of
 *  pixels in every shape instead of a thick border on the narrow one. */
export const SAFE_MARGIN = 0.05;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function safeRect(aspect: CompositionAspect): Rect {
  const { width, height } = ASPECT_DESIGN[aspect];
  const m = Math.round(Math.min(width, height) * SAFE_MARGIN);
  return { left: m, top: m, right: width - m, bottom: height - m };
}

export interface FitInput {
  /** Centre of the box in design px. */
  cx: number;
  cy: number;
  /** Half the box's size AT SCALE 1, panel padding included. Scale multiplies
   *  all of it (the panel is drawn inside the same scale), so one number each
   *  way is enough to know the box at any size. */
  unitHalfW: number;
  unitHalfH: number;
  scale: number;
}

export interface FitResult {
  scale: number;
  cx: number;
  cy: number;
  /** Made smaller to fit. */
  resized: boolean;
  /** Slid to bring it inside. */
  moved: boolean;
}

const EPS = 0.5; // half a pixel of tolerance — float noise isn't "outside"

/** Is any part of the box outside the rectangle? */
export function isOutside(input: FitInput, rect: Rect): boolean {
  const hw = input.unitHalfW * input.scale;
  const hh = input.unitHalfH * input.scale;
  return (
    input.cx - hw < rect.left - EPS ||
    input.cx + hw > rect.right + EPS ||
    input.cy - hh < rect.top - EPS ||
    input.cy + hh > rect.bottom + EPS
  );
}

/**
 * Bring a box inside the rectangle: shrink it if it's bigger than the
 * rectangle allows, then slide it in. Never GROWS a box — a headline someone
 * made small on purpose stays small — and never changes what it says.
 */
export function fitInto(
  input: FitInput,
  rect: Rect,
  minScale = 0.05,
): FitResult {
  const rw = rect.right - rect.left;
  const rh = rect.bottom - rect.top;
  const largest = Math.min(
    rw / (2 * input.unitHalfW),
    rh / (2 * input.unitHalfH),
  );
  // Rounded so repeated fits settle instead of nudging by float dust.
  const scale = Math.max(
    minScale,
    Math.round(Math.min(input.scale, largest) * 1000) / 1000,
  );
  const hw = input.unitHalfW * scale;
  const hh = input.unitHalfH * scale;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  // A box that still doesn't fit (pinned at the minimum) is centred, so it
  // overflows evenly instead of running off one side.
  const cx =
    hw * 2 >= rw
      ? (rect.left + rect.right) / 2
      : clamp(input.cx, rect.left + hw, rect.right - hw);
  const cy =
    hh * 2 >= rh
      ? (rect.top + rect.bottom) / 2
      : clamp(input.cy, rect.top + hh, rect.bottom - hh);
  return {
    scale,
    cx,
    cy,
    resized: scale < input.scale - 0.0005,
    moved: Math.abs(cx - input.cx) > EPS || Math.abs(cy - input.cy) > EPS,
  };
}
