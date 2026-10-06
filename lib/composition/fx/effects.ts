import { FX_META } from "./catalog";
import { hashSeed, seededRandom } from "./rand";
import type {
  FxBolt,
  FxCtx,
  FxPiece,
  FxScene,
  PixelFx,
  PixelFxKind,
  Pt,
} from "./types";

/**
 * The effects themselves — pure functions from progress (0..1) to a scene.
 * They draw nothing. The canvas preview (canvas.ts) and the server export
 * (frames.ts) each carry a scene out, so what the user scrubbed is what ships
 * by construction, and every effect is testable without a browser.
 *
 * Transitions run "q": 0 = whole, 1 = gone. Going OUT, q = p; coming IN the
 * same motion plays backwards (q = 1 - p), so assembling is the exact reverse
 * of breaking, not a second animation to keep in step with the first.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clamp = (v: number, lim: number) => Math.min(lim, Math.max(-lim, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function piece(
  ctx: Pick<FxCtx, "w" | "h">,
  over: Partial<FxPiece> = {},
): FxPiece {
  return {
    sx: 0,
    sy: 0,
    sw: ctx.w,
    sh: ctx.h,
    dx: 0,
    dy: 0,
    rot: 0,
    scale: 1,
    alpha: 1,
    ...over,
  };
}

/** The picture, whole and untouched. */
export function intactScene(ctx: Pick<FxCtx, "w" | "h">): FxScene {
  return { pieces: [piece(ctx)], bolts: [] };
}

/** Room each effect may use around the picture. Symmetric, so the rendered
 *  frame stays centred on the picture and the layer's position still holds. */
export function fxMargin(
  kind: PixelFxKind,
  w: number,
  h: number,
): { x: number; y: number } {
  switch (kind) {
    case "crumble":
      return { x: Math.ceil(w * 0.25), y: Math.ceil(h * 1.1) };
    case "slice":
      return { x: Math.ceil(w * 0.5), y: Math.ceil(h * 0.6 + w * 0.25) };
    case "dust":
      return { x: Math.ceil(w * 0.55), y: Math.ceil(h * 0.8) };
    case "electric":
      return { x: Math.ceil(w * 0.08), y: Math.ceil(h * 0.18) };
    case "glitch":
      return { x: Math.ceil(w * 0.14), y: 4 };
    case "shine":
      return { x: 0, y: 0 };
  }
}

interface Cell {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  cx: number;
  cy: number;
}

/** Cut the picture into a grid of at most `max` cells, none under `min` px. */
function gridCells(w: number, h: number, max: number, min: number): Cell[] {
  const size = Math.max(min, Math.ceil(Math.sqrt((w * h) / max)));
  const cells: Cell[] = [];
  for (let sy = 0; sy < h; sy += size) {
    for (let sx = 0; sx < w; sx += size) {
      const sw = Math.min(size, w - sx);
      const sh = Math.min(size, h - sy);
      cells.push({ sx, sy, sw, sh, cx: sx + sw / 2, cy: sy + sh / 2 });
    }
  }
  return cells;
}

const qOf = (ctx: FxCtx, p: number) => (ctx.mode === "out" ? p : 1 - p);

// ── crumble ─────────────────────────────────────────────────────────────────

const CRUMBLE_MAX_TILES = 56;

function crumble(ctx: FxCtx, p: number): FxScene {
  const q = qOf(ctx, p);
  const rng = seededRandom(ctx.seed);
  // Cracks start at one point and spread, so it breaks up rather than dropping
  // all at once.
  const ox = ctx.w * (0.25 + rng() * 0.5);
  const oy = ctx.h * (0.25 + rng() * 0.5);
  const reach = Math.hypot(ctx.w, ctx.h) / 2 || 1;

  const pieces = gridCells(ctx.w, ctx.h, CRUMBLE_MAX_TILES, 24).map((c) => {
    const r1 = rng();
    const r2 = rng();
    const r3 = rng();
    const delay =
      0.5 * clamp01(Math.hypot(c.cx - ox, c.cy - oy) / reach) + 0.12 * r1;
    const lp = clamp01((q - delay) / 0.38);
    // A tile shivers just before it lets go. The ramp starts at 0 or later, so
    // at progress 0 nothing is moving and the effect begins from the still.
    const rampFrom = Math.max(0, delay - 0.1);
    const rampTo = Math.max(delay, rampFrom + 0.02);
    const warn =
      smooth(rampFrom, rampTo, q) * (1 - smooth(rampTo, rampTo + 0.02, q));
    const shake = (r2 - 0.5) * 6 * warn;
    return piece(ctx, {
      sx: c.sx,
      sy: c.sy,
      sw: c.sw,
      sh: c.sh,
      dx: clamp(shake + (r2 - 0.5) * ctx.w * 0.16 * ctx.intensity * lp, ctx.mx),
      dy: clamp(shake + ctx.h * 0.8 * (0.7 + 0.6 * r3) * lp * lp, ctx.my),
      rot: (r3 - 0.5) * 2.4 * ctx.intensity * lp,
      scale: 1 - 0.2 * lp,
      alpha: 1 - smooth(0.55, 1, lp),
    });
  });
  return { pieces, bolts: [] };
}

// ── slice ───────────────────────────────────────────────────────────────────

function sliceBolt(ctx: FxCtx, a: Pt, b: Pt, alpha: number): FxBolt[] {
  const w = Math.max(3, ctx.h * 0.02);
  return [
    { pts: [a, b], width: w * 6, alpha: alpha * 0.1, color: ctx.color },
    { pts: [a, b], width: w * 3.5, alpha: alpha * 0.22, color: ctx.color },
    { pts: [a, b], width: w * 1.6, alpha: alpha * 0.5, color: ctx.color },
    { pts: [a, b], width: w, alpha, color: "#ffffff" },
  ];
}

const SEAM = 0.75;

function slice(ctx: FxCtx, p: number): FxScene {
  const q = qOf(ctx, p);
  const rng = seededRandom(ctx.seed);
  const theta = (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.4);
  const dir: Pt = [Math.cos(theta), Math.sin(theta)];
  const nrm: Pt = [-dir[1], dir[0]];
  const cuts = ctx.intensity < 1.3 ? 1 : ctx.intensity < 1.75 ? 2 : 3;
  const L = (Math.hypot(ctx.w, ctx.h) + 20) * 2;
  const cx = ctx.w / 2;
  const cy = ctx.h / 2;
  const spacing = Math.max(18, ctx.h * 0.3);
  // Offsets of each cut line from the centre line, along the normal.
  const offs = Array.from(
    { length: cuts },
    (_, j) => (j - (cuts - 1) / 2) * spacing,
  );
  const bounds = [-L, ...offs, L];

  const sep = smooth(0.12, 1, q);
  const fade = 1 - smooth(0.72, 1, q);

  const pieces: FxPiece[] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    // Neighbouring strips overlap by a pixel: two anti-aliased edges that
    // merely touch leave a faint hairline where the cut hasn't opened yet.
    const lo = bounds[k] - (k > 0 ? SEAM : 0);
    const hi = bounds[k + 1] + (k < bounds.length - 2 ? SEAM : 0);
    const at = (o: number, s: number): Pt => [
      cx + nrm[0] * o + dir[0] * s * L,
      cy + nrm[1] * o + dir[1] * s * L,
    ];
    const sign = k % 2 === 0 ? 1 : -1;
    const slide = sep * ctx.w * 0.6 * ctx.intensity * sign;
    const open = sep * ctx.h * 0.12 * sign;
    pieces.push(
      piece(ctx, {
        clip: [at(lo, -1), at(lo, 1), at(hi, 1), at(hi, -1)],
        dx: clamp(dir[0] * slide + nrm[0] * open, ctx.mx),
        dy: clamp(dir[1] * slide + nrm[1] * open, ctx.my),
        rot: sign * sep * 0.1,
        alpha: fade,
      }),
    );
  }

  // The flash of the cut itself, before anything moves.
  const flash = Math.sin(Math.PI * clamp01(q / 0.22));
  const bolts =
    flash > 0.02
      ? offs.flatMap((o) => {
          const half = Math.hypot(ctx.w, ctx.h) / 2 + 12;
          return sliceBolt(
            ctx,
            [cx + nrm[0] * o - dir[0] * half, cy + nrm[1] * o - dir[1] * half],
            [cx + nrm[0] * o + dir[0] * half, cy + nrm[1] * o + dir[1] * half],
            flash,
          );
        })
      : [];
  return { pieces, bolts };
}

// ── dust ────────────────────────────────────────────────────────────────────

const DUST_MAX_CELLS = 100;

function dust(ctx: FxCtx, p: number): FxScene {
  const q = qOf(ctx, p);
  const rng = seededRandom(ctx.seed);
  const pieces = gridCells(ctx.w, ctx.h, DUST_MAX_CELLS, 10).map((c) => {
    const r1 = rng();
    const r2 = rng();
    const r3 = rng();
    // A wave of decay left to right, as if blown from the left.
    const delay = 0.5 * (c.cx / (ctx.w || 1)) + 0.1 * r1;
    const lp = clamp01((q - delay) / 0.4);
    const drift = lp * (0.15 + 0.35 * r2) * ctx.w * ctx.intensity;
    const rise = lp * (0.1 + 0.5 * r3) * ctx.h * ctx.intensity;
    return piece(ctx, {
      sx: c.sx,
      sy: c.sy,
      sw: c.sw,
      sh: c.sh,
      dx: clamp(drift, ctx.mx),
      dy: clamp(-rise + lp * lp * ctx.h * 0.25, ctx.my),
      rot: (r3 - 0.5) * 3 * lp,
      scale: 1 - 0.75 * lp,
      alpha: 1 - smooth(0.35, 1, lp),
    });
  });
  return { pieces, bolts: [] };
}

// ── electric ────────────────────────────────────────────────────────────────

/** Midpoint-displaced polyline from a to b — the jag of a lightning bolt. */
function jagged(
  rng: () => number,
  a: Pt,
  b: Pt,
  amp: number,
  levels = 4,
): Pt[] {
  let pts: Pt[] = [a, b];
  for (let l = 0; l < levels; l++) {
    const next: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const off = ((rng() - 0.5) * 2 * amp) / (l + 1);
      next.push(pts[i], [
        (x0 + x1) / 2 - ((y1 - y0) / len) * off,
        (y0 + y1) / 2 + ((x1 - x0) / len) * off,
      ]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/** A bolt as a stack: wide faint halos, then a white-hot core. */
function glowing(pts: Pt[], width: number, alpha: number, color: string) {
  return [
    { pts, width: width * 6, alpha: alpha * 0.1, color },
    { pts, width: width * 3.4, alpha: alpha * 0.22, color },
    { pts, width: width * 1.8, alpha: alpha * 0.5, color },
    { pts, width, alpha, color: "#ffffff" },
  ] satisfies FxBolt[];
}

const FLICKER_HZ = 14;

function electric(ctx: FxCtx, p: number): FxScene {
  const e = Math.pow(Math.sin(Math.PI * clamp01(p)), 0.6);
  // The bolts and the shudder re-roll a few times a second, not every frame —
  // lightning that changes 30 times a second is noise, not lightning.
  const step = Math.floor(p * ctx.lengthSec * FLICKER_HZ);
  const rng = seededRandom((ctx.seed ^ Math.imul(step + 1, 7919)) >>> 0);

  const jit = ctx.h * 0.03 * e * ctx.intensity;
  const base = piece(ctx, {
    dx: clamp((rng() - 0.5) * 2 * jit, ctx.mx),
    dy: clamp((rng() - 0.5) * 2 * jit, ctx.my),
    // Flickers DOWN from whole as the strike builds, and is whole again at rest.
    alpha: 1 - 0.2 * rng() * e,
  });
  const aura = piece(ctx, {
    dx: base.dx,
    dy: base.dy,
    scale: 1.03,
    alpha: 0.28 * e,
    colorize: ctx.color,
    add: true,
  });

  const count = Math.round((2 + 3 * ctx.intensity) * e);
  const w = Math.max(2, ctx.h * 0.012);
  const bolts: FxBolt[] = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng() < 0.3;
    const a: Pt = vertical
      ? [ctx.w * (0.1 + rng() * 0.8), -ctx.h * 0.08]
      : [-ctx.w * 0.04 + rng() * ctx.w * 0.1, ctx.h * rng()];
    const b: Pt = vertical
      ? [ctx.w * (0.1 + rng() * 0.8), ctx.h * 1.08]
      : [ctx.w * 0.94 + rng() * ctx.w * 0.1, ctx.h * rng()];
    const main = jagged(rng, a, b, ctx.h * 0.18);
    bolts.push(...glowing(main, w, 0.95, ctx.color));
    if (rng() < 0.7) {
      const from = main[Math.floor(rng() * (main.length - 1))];
      const ang = rng() * Math.PI * 2;
      const len = ctx.h * (0.2 + rng() * 0.25);
      bolts.push(
        ...glowing(
          jagged(
            rng,
            from,
            [from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len],
            ctx.h * 0.08,
            3,
          ),
          w * 0.6,
          0.8,
          ctx.color,
        ),
      );
    }
  }
  const flash = rng() < 0.4 ? 0.35 * e : 0.1 * e;
  return {
    pieces: [aura, base],
    wash: { color: "#ffffff", alpha: flash },
    bolts,
  };
}

// ── glitch ──────────────────────────────────────────────────────────────────

const GLITCH_HZ = 18;

function glitch(ctx: FxCtx, p: number): FxScene {
  const e = Math.sin(Math.PI * clamp01(p));
  const step = Math.floor(p * ctx.lengthSec * GLITCH_HZ);
  const rng = seededRandom((ctx.seed ^ Math.imul(step + 1, 104729)) >>> 0);
  // Not every tick tears — the gaps are what makes it read as a glitch.
  if (rng() > 0.35 + 0.5 * e) return intactScene(ctx);

  const rows = 6 + Math.floor(rng() * 5);
  const cuts = [0];
  for (let i = 1; i < rows; i++)
    cuts.push(Math.round((ctx.h * i) / rows + (rng() - 0.5) * ctx.h * 0.06));
  cuts.push(ctx.h);
  cuts.sort((a, b) => a - b);

  const pieces: FxPiece[] = [];
  const split = ctx.w * 0.012 * e * ctx.intensity;
  pieces.push(
    piece(ctx, { dx: -split, colorize: "#ff2d55", add: true, alpha: 0.55 * e }),
    piece(ctx, { dx: split, colorize: "#00e5ff", add: true, alpha: 0.55 * e }),
  );
  for (let i = 0; i < cuts.length - 1; i++) {
    const sh = cuts[i + 1] - cuts[i];
    if (sh <= 0) continue;
    const moved = rng() < 0.55;
    pieces.push(
      piece(ctx, {
        sy: cuts[i],
        sh,
        dx: moved
          ? clamp((rng() - 0.5) * ctx.w * 0.12 * e * ctx.intensity, ctx.mx)
          : 0,
      }),
    );
  }
  return { pieces, bolts: [] };
}

// ── shine ───────────────────────────────────────────────────────────────────

function shine(ctx: FxCtx, p: number): FxScene {
  const travel = p * p * (3 - 2 * p);
  const width = Math.max(30, Math.min(ctx.w * 0.22, ctx.h * 0.55));
  const angle = 0.35;
  // Start and end fully off the picture, allowing for the lean.
  const lean = Math.tan(angle) * ctx.h;
  const from = -width - lean;
  const to = ctx.w + width + lean;
  return {
    pieces: [piece(ctx)],
    sweep: {
      cx: from + (to - from) * travel,
      width,
      angle,
      alpha: 0.95 * Math.pow(Math.sin(Math.PI * clamp01(p)), 0.4),
      color: ctx.color,
    },
    bolts: [],
  };
}

// ── entry points ────────────────────────────────────────────────────────────

const BUILDERS: Record<PixelFxKind, (ctx: FxCtx, p: number) => FxScene> = {
  crumble,
  slice,
  dust,
  electric,
  glitch,
  shine,
};

export function buildFxScene(
  kind: PixelFxKind,
  ctx: FxCtx,
  p: number,
): FxScene {
  return BUILDERS[kind](ctx, clamp01(p));
}

/**
 * The scene for an effect on a picture of `size`, at progress `p` through the
 * current run. `text` only seeds the randomness, so a given sticker always
 * crumbles the same way — and the preview and the export agree.
 */
export function fxSceneFor(
  fx: PixelFx,
  size: { w: number; h: number },
  text: string,
  p: number,
): FxScene {
  const margin = fxMargin(fx.kind, size.w, size.h);
  return buildFxScene(
    fx.kind,
    {
      w: size.w,
      h: size.h,
      seed: hashSeed(`${text}|${fx.kind}`),
      color: fx.color ?? FX_META[fx.kind].defaultColor ?? "#ffffff",
      intensity: fx.intensity,
      mode: fx.mode,
      lengthSec: fx.lengthSec,
      mx: margin.x,
      my: margin.y,
    },
    p,
  );
}
