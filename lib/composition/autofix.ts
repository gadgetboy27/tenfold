import { z } from "zod";
import type {
  CompositionOverrides,
  LayerOverride,
} from "@/lib/composition/layers";

/**
 * "Auto-fix this format" (docs/multiformat-manifesto.md Phase 6): the OPTIONAL,
 * credit-costing vision polish. A flagged format's thumbnail + its safe zones +
 * the layer positions go to Claude vision, which proposes per-layer nudges. The
 * nudges apply as PER-FORMAT OVERRIDES (never touching the master) — the vision
 * pass reviews the maths layout, it is never the engine.
 *
 * Shared types + a pure adjustment→override conversion, safe on client & server.
 */

/** One layer's current geometry in a format, normalized 0..1. */
export const autofixLayerSchema = z.object({
  id: z.string(),
  kind: z.enum(["image", "text"]),
  /** Text content (helps the model reason about overflow); omitted for images. */
  text: z.string().optional(),
  /** Centre + half-size as fractions of the canvas. */
  nx: z.number(),
  ny: z.number(),
  hw: z.number(),
  hh: z.number(),
});
export type AutofixLayer = z.infer<typeof autofixLayerSchema>;

/** A UI-chrome rectangle to keep content clear of, normalized 0..1. */
export const autofixZoneSchema = z.object({
  label: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type AutofixZone = z.infer<typeof autofixZoneSchema>;

/** A proposed nudge: a new normalized centre and/or a relative scale multiplier. */
export const autofixAdjustmentSchema = z.object({
  layerId: z.string(),
  nx: z.number().optional(),
  ny: z.number().optional(),
  /** Relative multiplier on the layer's current scale (1 = unchanged). */
  scale: z.number().positive().max(5).optional(),
});
export type AutofixAdjustment = z.infer<typeof autofixAdjustmentSchema>;

/**
 * Turn the model's adjustments into per-format overrides for one aspect. Pos
 * becomes a fraction override; scale is applied as a multiplier on the layer's
 * current (effective) scale and clamped to the layer scale bounds. Adjustments
 * for unknown layers, or with nothing to change, are dropped.
 */
export function adjustmentsToOverrides(
  adjustments: AutofixAdjustment[],
  currentScale: Record<string, number>,
): Record<string, LayerOverride> {
  const out: Record<string, LayerOverride> = {};
  for (const a of adjustments) {
    if (!(a.layerId in currentScale)) continue;
    const o: LayerOverride = {};
    if (a.nx !== undefined && a.ny !== undefined) {
      o.pos = { mode: "fraction", nx: a.nx, ny: a.ny };
    }
    if (a.scale !== undefined) {
      const base = currentScale[a.layerId] ?? 1;
      o.scale = Math.min(20, Math.max(0.05, base * a.scale));
    }
    if (o.pos || o.scale !== undefined) out[a.layerId] = o;
  }
  return out;
}

/** Merge a set of per-layer overrides into a doc's overrides for one aspect. */
export function mergeFormatOverrides(
  existing: CompositionOverrides | undefined,
  aspect: string,
  patch: Record<string, LayerOverride>,
): CompositionOverrides {
  const overrides: CompositionOverrides = { ...(existing ?? {}) };
  const forAspect = { ...(overrides[aspect] ?? {}) };
  for (const [layerId, o] of Object.entries(patch)) {
    forAspect[layerId] = { ...(forAspect[layerId] ?? {}), ...o };
  }
  overrides[aspect] = forAspect;
  return overrides;
}
