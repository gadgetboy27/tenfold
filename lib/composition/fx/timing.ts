import { isPulse } from "./catalog";
import type { PixelFx } from "./types";

/**
 * When a pixel effect plays — pure, shared by the canvas preview and the
 * export so the two cannot drift. Resolves the user's PERCENTAGE of the clip
 * into seconds against the real clip length.
 */

export interface FxWindow {
  start: number;
  end: number;
  lengthSec: number;
  cycles: number;
}

export function fxCycles(fx: Pick<PixelFx, "kind" | "repeat">): number {
  return isPulse(fx.kind) ? fx.repeat : 1;
}

/**
 * The effect always plays in full: asking for 100% starts it as late as it can
 * and still finish before the clip ends, rather than being cut off.
 */
export function resolveFxWindow(fx: PixelFx, clipSec: number): FxWindow {
  const cycles = fxCycles(fx);
  const total = fx.lengthSec * cycles;
  const wanted = (fx.startPct / 100) * clipSec;
  const start = Math.max(0, Math.min(wanted, clipSec - total));
  return { start, end: start + total, lengthSec: fx.lengthSec, cycles };
}

export type FxPhaseName = "before" | "active" | "after";

export interface FxPhase {
  phase: FxPhaseName;
  /** 0..1 through the current run. Meaningful when phase is "active". */
  progress: number;
  cycle: number;
}

export function fxPhaseAt(fx: PixelFx, clipSec: number, t: number): FxPhase {
  const w = resolveFxWindow(fx, clipSec);
  if (t < w.start) return { phase: "before", progress: 0, cycle: 0 };
  if (t >= w.end) return { phase: "after", progress: 1, cycle: w.cycles - 1 };
  const run = (t - w.start) / w.lengthSec;
  const cycle = Math.min(w.cycles - 1, Math.floor(run));
  return { phase: "active", progress: run - cycle, cycle };
}

/**
 * Is the plain, un-animated picture on show in this phase? Pulses: whole on
 * either side. A transition going out: whole before, gone after. Coming in:
 * gone before, whole after.
 */
export function staticVisible(fx: PixelFx, phase: FxPhaseName): boolean {
  if (phase === "active") return false;
  if (isPulse(fx.kind)) return true;
  return fx.mode === "out" ? phase === "before" : phase === "after";
}

/**
 * The stretches of [from, to] where the plain picture is on show — the export
 * overlays it only then, and overlays the rendered effect frames over the
 * window itself. Half-open intervals, so a frame on a boundary is drawn once.
 */
export function staticIntervals(
  fx: PixelFx,
  win: FxWindow,
  from: number,
  to: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const add = (a: number, b: number) => {
    const lo = Math.max(a, from);
    const hi = Math.min(b, to);
    if (hi > lo) out.push([lo, hi]);
  };
  if (isPulse(fx.kind)) {
    add(from, win.start);
    add(win.end, to);
  } else if (fx.mode === "out") {
    add(from, win.start);
  } else {
    add(win.end, to);
  }
  return out;
}
