import { describe, it, expect } from "vitest";
import {
  canUseCompositing,
  type CompositingCapability,
} from "@/lib/compositing/access";
import type { Tier } from "@/lib/billing/entitlements";

const NON_BLEND: CompositingCapability[] = [
  "cutout",
  "inpaint",
  "relight",
  "depth",
];
const BLEND: CompositingCapability[] = ["blend", "mechanical_blend"];
const NON_AGENCY_TIERS: Tier[] = ["payg", "creator", "business"];

describe("canUseCompositing — Agency always allowed", () => {
  it("allows every capability on Agency, with or without the add-on", () => {
    for (const cap of [...NON_BLEND, ...BLEND]) {
      expect(canUseCompositing("agency", cap, false).allowed).toBe(true);
      expect(canUseCompositing("agency", cap, true).allowed).toBe(true);
    }
  });
});

describe("canUseCompositing — non-blend ops are Agency-exclusive", () => {
  it("blocks payg, creator and business for cutout/inpaint/relight/depth, addon or not", () => {
    for (const tier of NON_AGENCY_TIERS) {
      for (const cap of NON_BLEND) {
        expect(canUseCompositing(tier, cap, false).allowed).toBe(false);
        expect(canUseCompositing(tier, cap, true).allowed).toBe(false);
      }
    }
  });

  it("gives a reason mentioning Agency for a locked non-blend op", () => {
    const result = canUseCompositing("business", "inpaint", true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/agency/i);
  });
});

describe("canUseCompositing — blend is the one carve-out", () => {
  it("blocks payg and creator from blend even with the add-on flag set", () => {
    expect(canUseCompositing("payg", "blend", true).allowed).toBe(false);
    expect(canUseCompositing("creator", "blend", true).allowed).toBe(false);
    expect(canUseCompositing("payg", "mechanical_blend", true).allowed).toBe(
      false,
    );
  });

  it("blocks Business from blend without the add-on", () => {
    expect(canUseCompositing("business", "blend", false).allowed).toBe(false);
    expect(
      canUseCompositing("business", "mechanical_blend", false).allowed,
    ).toBe(false);
  });

  it("allows Business blend (AI and mechanical) once the add-on is active", () => {
    expect(canUseCompositing("business", "blend", true).allowed).toBe(true);
    expect(
      canUseCompositing("business", "mechanical_blend", true).allowed,
    ).toBe(true);
  });

  it("gives a Business-specific reason pointing at the add-on when blocked", () => {
    const result = canUseCompositing("business", "blend", false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/blend package/i);
  });
});
