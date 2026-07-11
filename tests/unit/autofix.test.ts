import { describe, it, expect } from "vitest";
import {
  adjustmentsToOverrides,
  mergeFormatOverrides,
  autofixAdjustmentSchema,
} from "@/lib/composition/autofix";

describe("adjustmentsToOverrides", () => {
  const scales = { logo: 2, cap: 1 };

  it("turns a move + scale multiplier into a fraction pos + absolute scale", () => {
    const out = adjustmentsToOverrides(
      [{ layerId: "logo", nx: 0.9, ny: 0.9, scale: 0.5 }],
      scales,
    );
    expect(out.logo).toEqual({
      pos: { mode: "fraction", nx: 0.9, ny: 0.9 },
      scale: 1, // base 2 × 0.5
    });
  });

  it("applies a scale-only nudge and drops position when only one axis is given", () => {
    const out = adjustmentsToOverrides(
      [
        { layerId: "cap", scale: 0.5 }, // scale only
        { layerId: "logo", ny: 0.7 }, // half a position → no pos, no scale → dropped
      ],
      scales,
    );
    expect(out.cap).toEqual({ scale: 0.5 });
    expect(out.logo).toBeUndefined();
  });

  it("drops unknown layers and clamps scale to the layer bounds", () => {
    const out = adjustmentsToOverrides(
      [
        { layerId: "ghost", nx: 0.1, ny: 0.1 }, // unknown → dropped
        { layerId: "logo", scale: 100 }, // 2 × 100 = 200 → clamp 20
      ],
      scales,
    );
    expect(out.ghost).toBeUndefined();
    expect(out.logo).toEqual({ scale: 20 });
  });

  it("validates the adjustment schema", () => {
    expect(() =>
      autofixAdjustmentSchema.parse({ layerId: "a", nx: 0.5, ny: 0.5 }),
    ).not.toThrow();
    expect(() =>
      autofixAdjustmentSchema.parse({ layerId: "a", scale: -1 }),
    ).toThrow(); // scale must be positive
  });
});

describe("mergeFormatOverrides", () => {
  it("merges per-layer into one aspect, leaving others untouched, no mutation", () => {
    const existing = {
      "9:16": { logo: { scale: 3 } },
      "1:1": { cap: { scale: 2 } },
    };
    const merged = mergeFormatOverrides(existing, "9:16", {
      logo: { pos: { mode: "fraction", nx: 0.1, ny: 0.1 } },
      cap: { scale: 5 },
    });
    // Untouched aspect preserved.
    expect(merged["1:1"]).toEqual({ cap: { scale: 2 } });
    // Existing layer override deep-merged with the new field.
    expect(merged["9:16"].logo).toEqual({
      scale: 3,
      pos: { mode: "fraction", nx: 0.1, ny: 0.1 },
    });
    expect(merged["9:16"].cap).toEqual({ scale: 5 });
    // Original object not mutated.
    expect(existing["9:16"].logo).toEqual({ scale: 3 });
  });

  it("creates the aspect entry when none exists", () => {
    const merged = mergeFormatOverrides(undefined, "16:9", {
      logo: { scale: 0.5 },
    });
    expect(merged).toEqual({ "16:9": { logo: { scale: 0.5 } } });
  });
});
