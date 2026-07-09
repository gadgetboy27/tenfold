import type {
  EffectInKind,
  EffectLoopKind,
  EffectOutKind,
  Layer,
  LayerEffects,
} from "@/lib/composition/layers";

export type { EffectInKind, EffectOutKind, EffectLoopKind, LayerEffects };

/**
 * Layer animation effects — entrances, exits and ambient loops
 * (docs/tenfold-compositor-brief.md §4, effects suite).
 *
 * Every effect is a pure function of progress p ∈ [0,1] returning motion
 * offsets {dx, dy, rotDeg, alpha}. The canvas preview evaluates it directly
 * per frame; the FFmpeg export SAMPLES the same curve into a piecewise-linear
 * time expression (see sampledExpr) — one source of truth, two renderers, so
 * the preview never lies about the MP4. Zoom/scale effects are deliberately
 * absent: FFmpeg cannot animate scale without flattening logo transparency.
 */

export interface Motion {
  dx: number;
  dy: number;
  rotDeg: number;
  /** Alpha multiplier 0..1 (multiplies layer opacity). */
  alpha: number;
}

export interface EffectCtx {
  /** Design-space dimensions — travel distances derive from these. */
  W: number;
  H: number;
}

const REST: Motion = { dx: 0, dy: 0, rotDeg: 0, alpha: 1 };

// ── Easings ──────────────────────────────────────────────────────────────────

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInQuad = (p: number) => p * p;
const easeOutBack = (p: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};
const easeOutBounce = (p: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
  return n1 * (p -= 2.625 / d1) * p + 0.984375;
};

// ── Entrances ────────────────────────────────────────────────────────────────
// p: 0 = animation start, 1 = at rest.

type EffectFn = (p: number, ctx: EffectCtx) => Motion;

const slide =
  (sx: number, sy: number): EffectFn =>
  (p, { W, H }) => {
    const e = 1 - easeOutCubic(p);
    return { dx: sx * W * e, dy: sy * H * e, rotDeg: 0, alpha: 1 };
  };

const walk =
  (from: 1 | -1): EffectFn =>
  (p, { W }) => ({
    dx: from * W * (1 - easeOutCubic(p) * 0.999 - 0.001 * p),
    // stepped bob + a light rock, like it strolls into place
    dy: -Math.abs(Math.sin(p * Math.PI * 4)) * 14 * (1 - p * 0.5),
    rotDeg: Math.sin(p * Math.PI * 8) * 3 * (1 - p),
    alpha: 1,
  });

const kick =
  (sx: number, sy: number): EffectFn =>
  (p, { W, H }) => ({
    dx: sx * W * (1 - p),
    // projectile arc on top of the straight flight path
    dy: sy * H * (1 - p) - Math.sin(Math.PI * p) * H * 0.12,
    rotDeg: 720 * (1 - easeOutCubic(p)),
    alpha: 1,
  });

export const EFFECTS_IN: Record<EffectInKind, { label: string; fn: EffectFn }> =
  {
    none: { label: "None", fn: () => REST },
    fade: {
      label: "Fade in",
      fn: (p) => ({ ...REST, alpha: p }),
    },
    "slide-left": { label: "Slide in from left", fn: slide(-1, 0) },
    "slide-right": { label: "Slide in from right", fn: slide(1, 0) },
    "slide-top": { label: "Slide in from top", fn: slide(0, -1) },
    "slide-bottom": { label: "Slide in from bottom", fn: slide(0, 1) },
    "slide-tl": { label: "Diagonal in — top left", fn: slide(-1, -1) },
    "slide-tr": { label: "Diagonal in — top right", fn: slide(1, -1) },
    "slide-bl": { label: "Diagonal in — bottom left", fn: slide(-1, 1) },
    "slide-br": { label: "Diagonal in — bottom right", fn: slide(1, 1) },
    drop: {
      label: "Drop from above",
      fn: (p, { H }) => ({ ...REST, dy: -H * (1 - easeInQuad(p)) }),
    },
    bounce: {
      label: "Bounce in",
      fn: (p, { H }) => ({ ...REST, dy: -H * (1 - easeOutBounce(p)) }),
    },
    rise: {
      label: "Rise from below",
      fn: (p, { H }) => ({
        ...REST,
        dy: H * 0.25 * (1 - easeOutCubic(p)),
        alpha: Math.min(1, p * 2),
      }),
    },
    rotate: {
      label: "Rotate in",
      fn: (p) => ({ ...REST, rotDeg: -90 * (1 - easeOutCubic(p)), alpha: p }),
    },
    spin: {
      label: "Spin in",
      fn: (p) => ({
        ...REST,
        rotDeg: 720 * (1 - easeOutCubic(p)),
        alpha: Math.min(1, p * 3),
      }),
    },
    "walk-left": { label: "Walk in from left", fn: walk(-1) },
    "walk-right": { label: "Walk in from right", fn: walk(1) },
    "kick-left": { label: "Kicked in from left", fn: kick(-1, 0) },
    "kick-right": { label: "Kicked in from right", fn: kick(1, 0) },
    "kick-up": { label: "Kicked up from below", fn: kick(0, 1) },
    overshoot: {
      label: "Overshoot & settle",
      fn: (p, { W }) => ({ ...REST, dx: -W * 0.5 * (1 - easeOutBack(p)) }),
    },
    swing: {
      label: "Swing in",
      fn: (p) => ({
        ...REST,
        rotDeg: 35 * Math.sin(p * Math.PI * 3) * (1 - p) * (1 - p),
        alpha: Math.min(1, p * 4),
      }),
    },
    flash: {
      label: "Flash in",
      fn: (p) => ({
        ...REST,
        alpha: p >= 1 ? 1 : Math.floor(p * 6) % 2 ? 1 : 0.15,
      }),
    },
  };

// ── Exits ────────────────────────────────────────────────────────────────────
// p: 0 = at rest, 1 = gone.

const slideOut =
  (sx: number, sy: number): EffectFn =>
  (p, { W, H }) => {
    const e = easeInQuad(p);
    return { dx: sx * W * e, dy: sy * H * e, rotDeg: 0, alpha: 1 };
  };

export const EFFECTS_OUT: Record<
  EffectOutKind,
  { label: string; fn: EffectFn }
> = {
  none: { label: "None", fn: () => REST },
  fade: { label: "Fade out", fn: (p) => ({ ...REST, alpha: 1 - p }) },
  "slide-left": { label: "Slide out left", fn: slideOut(-1, 0) },
  "slide-right": { label: "Slide out right", fn: slideOut(1, 0) },
  "slide-top": { label: "Slide out top", fn: slideOut(0, -1) },
  "slide-bottom": { label: "Slide out bottom", fn: slideOut(0, 1) },
  "drop-away": {
    label: "Drop away",
    fn: (p, { H }) => ({ ...REST, dy: H * easeInQuad(p), rotDeg: 20 * p }),
  },
  sink: {
    label: "Sink below",
    fn: (p, { H }) => ({ ...REST, dy: H * 0.25 * easeInQuad(p), alpha: 1 - p }),
  },
  spin: {
    label: "Spin out",
    fn: (p) => ({ ...REST, rotDeg: 720 * easeInQuad(p), alpha: 1 - p }),
  },
  kick: {
    label: "Kicked away",
    fn: (p, { W, H }) => ({
      dx: W * easeInQuad(p),
      dy: -Math.sin(Math.PI * Math.min(1, p * 1.2)) * H * 0.15,
      rotDeg: 540 * p,
      alpha: 1,
    }),
  },
  flash: {
    label: "Flash out",
    fn: (p) => ({
      ...REST,
      alpha: p >= 1 ? 0 : Math.floor(p * 6) % 2 ? 0.15 : 1,
    }),
  },
};

// ── Ambient loops (while on screen) ─────────────────────────────────────────
// tv = seconds since the layer became visible. Analytic (sin-based) so the
// export can emit the exact formula instead of sampling a long window.

export const EFFECTS_LOOP: Record<
  EffectLoopKind,
  {
    label: string;
    js: (tv: number) => Motion;
    /** Same curve as an FFmpeg expression in the given time variable. */
    ffmpeg: (
      tvExpr: string,
    ) => Partial<Record<"dx" | "dy" | "rot" | "alpha", string>>;
  }
> = {
  none: { label: "None", js: () => REST, ffmpeg: () => ({}) },
  float: {
    label: "Float (gentle hover)",
    js: (tv) => ({ ...REST, dy: Math.sin((tv * 2 * Math.PI) / 3) * 10 }),
    ffmpeg: (tv) => ({ dy: `sin((${tv})*2*PI/3)*10` }),
  },
  sway: {
    label: "Sway (slow rock)",
    js: (tv) => ({ ...REST, rotDeg: Math.sin((tv * 2 * Math.PI) / 4) * 3 }),
    ffmpeg: (tv) => ({ rot: `sin((${tv})*2*PI/4)*3` }),
  },
  shimmer: {
    label: "Shimmer (alpha pulse)",
    js: (tv) => ({
      ...REST,
      alpha: 1 - 0.18 * (0.5 + 0.5 * Math.sin((tv * 2 * Math.PI) / 2)),
    }),
    ffmpeg: (tv) => ({
      alpha: `(1-0.18*(0.5+0.5*sin((${tv})*2*PI/2)))`,
    }),
  },
};

// ── Layer effect config + legacy mapping ────────────────────────────────────

/** Resolve a layer's effects, mapping the legacy fadeSec field onto fade
 *  in/out when no explicit effects are set (old saved compositions). */
export function effectsOf(layer: Layer): LayerEffects {
  const explicit = layer.effects;
  if (explicit) return explicit;
  const fade = layer.fadeSec > 0;
  return {
    in: { kind: fade ? "fade" : "none", durationSec: layer.fadeSec || 0.6 },
    out: {
      kind: fade && layer.disappearAt !== null ? "fade" : "none",
      durationSec: layer.fadeSec || 0.6,
    },
    loop: "none",
  };
}

/**
 * Combined motion for a layer at time t — entrance, ambient loop and exit,
 * multiplied by layer opacity. Returns null when the layer is not visible.
 * The canvas and the export sampler both go through this.
 */
export function motionAt(
  layer: Layer,
  t: number,
  clipDurationSec: number,
  ctx: EffectCtx,
): Motion | null {
  const start = layer.appearAt;
  const end = layer.disappearAt ?? clipDurationSec;
  if (t < start || t > end) return null;

  const fx = effectsOf(layer);
  const m: Motion = { dx: 0, dy: 0, rotDeg: 0, alpha: 1 };

  if (fx.in.kind !== "none" && fx.in.durationSec > 0) {
    const p = Math.min(1, (t - start) / fx.in.durationSec);
    const e = EFFECTS_IN[fx.in.kind].fn(p, ctx);
    m.dx += e.dx;
    m.dy += e.dy;
    m.rotDeg += e.rotDeg;
    m.alpha *= e.alpha;
  }
  if (fx.out.kind !== "none" && fx.out.durationSec > 0) {
    const outStart = end - fx.out.durationSec;
    if (t >= outStart) {
      const p = Math.min(1, (t - outStart) / fx.out.durationSec);
      const e = EFFECTS_OUT[fx.out.kind].fn(p, ctx);
      m.dx += e.dx;
      m.dy += e.dy;
      m.rotDeg += e.rotDeg;
      m.alpha *= e.alpha;
    }
  }
  if (fx.loop !== "none") {
    const e = EFFECTS_LOOP[fx.loop].js(t - start);
    m.dx += e.dx;
    m.dy += e.dy;
    m.rotDeg += e.rotDeg;
    m.alpha *= e.alpha;
  }

  m.alpha = Math.min(1, Math.max(0, m.alpha)) * layer.opacity;
  return m;
}

// ── FFmpeg expression sampling ───────────────────────────────────────────────

const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : `${r}`;
};

/**
 * Sample fn over [tStart, tStart+dur] at n points and emit a piecewise-linear
 * FFmpeg expression in t. Outside the window it evaluates to the edge values;
 * callers gate with their own window logic.
 */
export function sampledExpr(
  fn: (t: number) => number,
  tStart: number,
  dur: number,
  n = 24,
): string {
  const ts: number[] = [];
  const vs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = tStart + (dur * i) / n;
    ts.push(t);
    vs.push(fn(t));
  }
  // Build from the last segment inward: if(lt(t,t1), lerp0, if(lt(t,t2), …))
  let expr = fmt(vs[n]);
  for (let i = n - 1; i >= 0; i--) {
    const dt = ts[i + 1] - ts[i] || 1;
    const slope = (vs[i + 1] - vs[i]) / dt;
    const seg =
      slope === 0
        ? fmt(vs[i])
        : `${fmt(vs[i])}+${fmt(slope)}*(t-${fmt(ts[i])})`;
    expr = `if(lt(t,${fmt(ts[i + 1])}),${seg},${expr})`;
  }
  return `if(lt(t,${fmt(ts[0])}),${fmt(vs[0])},${expr})`;
}

export interface MotionExprs {
  /** null = channel is static for this layer (no expression needed). */
  dx: string | null;
  dy: string | null;
  rot: string | null;
  alpha: string | null;
}

type Channel = "dx" | "dy" | "rot" | "alpha";

const PICK: Record<Channel, (m: Motion) => number> = {
  dx: (m) => m.dx,
  dy: (m) => m.dy,
  rot: (m) => m.rotDeg,
  alpha: (m) => m.alpha,
};

/** Which channels a layer's effects animate, as FFmpeg expressions in t. */
export function motionExprs(
  layer: Layer,
  clipDurationSec: number,
  ctx: EffectCtx,
): MotionExprs {
  const fx = effectsOf(layer);
  const start = layer.appearAt;
  const end = layer.disappearAt ?? clipDurationSec;

  const channel = (ch: Channel): string | null => {
    const pick = PICK[ch];
    const isAlpha = ch === "alpha";
    const neutral = isAlpha ? 1 : 0;
    const parts: string[] = [];

    // Emit a windowed piecewise expression when the phase actually moves
    // this channel (probe start / middle / end).
    const phase = (
      fn: (t: number) => number,
      t0: number,
      dur: number,
      gate: string,
    ) => {
      const moves = [0, dur / 2, dur].some((o) => fn(t0 + o) !== neutral);
      if (!moves) return;
      parts.push(`if(${gate},${sampledExpr(fn, t0, dur)},${neutral})`);
    };

    if (fx.in.kind !== "none" && fx.in.durationSec > 0) {
      const dur = Math.min(fx.in.durationSec, Math.max(0.05, end - start));
      phase(
        (t) =>
          pick(EFFECTS_IN[fx.in.kind].fn(Math.min(1, (t - start) / dur), ctx)),
        start,
        dur,
        `between(t,${fmt(start)},${fmt(start + dur)})`,
      );
    }
    if (fx.out.kind !== "none" && fx.out.durationSec > 0) {
      const dur = Math.min(fx.out.durationSec, Math.max(0.05, end - start));
      const outStart = end - dur;
      phase(
        (t) =>
          pick(
            EFFECTS_OUT[fx.out.kind].fn(Math.min(1, (t - outStart) / dur), ctx),
          ),
        outStart,
        dur,
        `gte(t,${fmt(outStart)})`,
      );
    }
    if (fx.loop !== "none") {
      const amb = EFFECTS_LOOP[fx.loop].ffmpeg(`t-${fmt(start)}`);
      if (amb[ch]) parts.push(amb[ch]!);
    }

    if (parts.length === 0) return null;
    // Alphas multiply (fade × shimmer); positional offsets add.
    return isAlpha ? `(${parts.join(")*(")})` : `(${parts.join(")+(")})`;
  };

  return {
    dx: channel("dx"),
    dy: channel("dy"),
    rot: channel("rot"),
    alpha: channel("alpha"),
  };
}
