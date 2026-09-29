import type { RevealEnd, RevealMode, TextReveal } from "./layers";

/**
 * Read-out timing for text layers — pure, shared by the canvas preview
 * (render.ts) and the FFmpeg export (export.ts) so the two cannot drift.
 */

/** How long an end effect plays. */
export const REVEAL_END_SEC = 0.7;
/** Karaoke's not-yet-read text, as a fraction of the layer's alpha. */
export const KARAOKE_DIM = 0.3;
/** Cap on distinct states the export draws (one drawtext filter each). */
const MAX_EXPORT_STEPS = 60;

export interface RevealTimes {
  readStart: number;
  readEnd: number;
  endStart: number;
  endEnd: number;
}

export function revealTimes(
  appearAt: number,
  r: Pick<TextReveal, "delaySec" | "durationSec" | "holdSec">,
): RevealTimes {
  const readStart = appearAt + r.delaySec;
  const readEnd = readStart + r.durationSec;
  const endStart = readEnd + r.holdSec;
  return { readStart, readEnd, endStart, endEnd: endStart + REVEAL_END_SEC };
}

/** Reading progress at time t: -1 before it starts, then 0..1. */
export function revealProgress(
  appearAt: number,
  r: Pick<TextReveal, "delaySec" | "durationSec" | "holdSec">,
  t: number,
): number {
  const { readStart, readEnd } = revealTimes(appearAt, r);
  if (t < readStart) return -1;
  return Math.min(1, (t - readStart) / (readEnd - readStart));
}

const WORD = /\S+/g;

/** How many units the read-out steps through: letters, or words. */
export function revealUnitCount(text: string, mode: RevealMode): number {
  return mode === "typewriter" ? text.length : (text.match(WORD)?.length ?? 0);
}

/** Units showing at progress p (p < 0 = not started). The first unit lands
 *  the instant reading starts; everything is showing at p = 1. */
export function litCount(p: number, total: number): number {
  if (p < 0 || total === 0) return 0;
  if (p >= 1) return total;
  return Math.min(total, Math.floor(p * total) + 1);
}

/** The first `count` units of `text`, line breaks preserved. */
export function prefixByCount(
  text: string,
  mode: RevealMode,
  count: number,
): string {
  if (count <= 0) return "";
  if (mode === "typewriter") return text.slice(0, count);
  let end = 0;
  let seen = 0;
  for (const m of text.matchAll(WORD)) {
    seen++;
    end = (m.index ?? 0) + m[0].length;
    if (seen >= count) break;
  }
  return text.slice(0, end);
}

export interface EndMotion {
  dx: number;
  dy: number;
  alpha: number;
}

/**
 * What the block does once it has finished reading. p: 0 → 1 over
 * REVEAL_END_SEC. Motion only (offsets + alpha) — the two channels drawtext
 * can animate — so preview and MP4 agree. A "bump" is a hop, not a scale.
 */
export function revealEnd(
  kind: RevealEnd,
  p: number,
  ctx: { W: number; H: number },
): EndMotion {
  const rest = { dx: 0, dy: 0, alpha: 1 };
  if (kind === "none" || p < 0 || p >= 1) return rest;
  switch (kind) {
    case "flash":
      return { ...rest, alpha: Math.floor(p * 6) % 2 ? 0.15 : 1 };
    case "bump":
      return { ...rest, dy: -Math.sin(Math.PI * p) * ctx.H * 0.03 };
    case "pulse":
      return { ...rest, alpha: 1 - 0.5 * Math.sin(Math.PI * 2 * p) ** 2 };
    case "shake":
      return {
        ...rest,
        dx: Math.sin(p * Math.PI * 12) * ctx.W * 0.012 * (1 - p),
      };
  }
}

export interface RevealStep {
  t: number;
  count: number;
}

/** When the export switches to a longer prefix (coarsened to a filter budget). */
export function revealSteps(
  text: string,
  mode: RevealMode,
  readStart: number,
  durationSec: number,
): RevealStep[] {
  const N = revealUnitCount(text, mode);
  if (N === 0) return [];
  const K = Math.min(N, MAX_EXPORT_STEPS);
  const steps: RevealStep[] = [];
  for (let j = 0; j < K; j++) {
    const count = Math.min(N, Math.floor((j * N) / K) + 1);
    if (steps.at(-1)?.count !== count)
      steps.push({ t: readStart + (durationSec * j) / K, count });
  }
  if (steps.at(-1)?.count !== N)
    steps.push({ t: readStart + durationSec, count: N });
  return steps;
}

export interface RevealDraw {
  /** Which line of the block this draws. */
  line: number;
  text: string;
  /** Not-yet-read karaoke text, drawn dim under the lit part. */
  dim: boolean;
  from: number;
  to: number;
}

/**
 * The export's plan: one drawtext per (line, state). A line's lit prefix is
 * drawn until the next step changes it; each finished line stays to the end.
 * Null when there is nothing to draw with (no measured widths).
 */
export function revealDrawPlan(
  layer: {
    text: string;
    appearAt: number;
    disappearAt: number | null;
    reveal?: TextReveal;
  },
  clipDur: number,
): RevealDraw[] | null {
  const r = layer.reveal;
  const lines = layer.text.split("\n");
  if (!r || r.lineWidths?.length !== lines.length) return null;
  const A = layer.appearAt;
  const E = layer.disappearAt ?? clipDur;
  const { readStart } = revealTimes(A, r);
  const out: RevealDraw[] = [];

  if (r.mode === "karaoke") {
    lines.forEach((text, line) => {
      if (text) out.push({ line, text, dim: true, from: A, to: E });
    });
  }
  const open = new Map<number, RevealDraw>();
  for (const step of revealSteps(
    layer.text,
    r.mode,
    readStart,
    r.durationSec,
  )) {
    const lit = prefixByCount(layer.text, r.mode, step.count).split("\n");
    lines.forEach((_, line) => {
      const text = lit[line] ?? "";
      const cur = open.get(line);
      if (cur && cur.text === text) return;
      if (cur) cur.to = Math.min(step.t, E);
      open.delete(line);
      if (text) {
        const d: RevealDraw = {
          line,
          text,
          dim: false,
          from: Math.max(step.t, A),
          to: E,
        };
        open.set(line, d);
        out.push(d);
      }
    });
  }
  return out.filter((d) => d.to > d.from);
}
