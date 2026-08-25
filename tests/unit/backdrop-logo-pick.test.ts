import { describe, it, expect } from "vitest";
import {
  relativeLuminance,
  pickContrastingLogo,
} from "@/lib/composition/backdrop";
import { pickKitLogo } from "@/lib/composition/brand-apply";

/**
 * Which logo variant goes on the ad.
 *
 * `pickKitLogo` picks by AVAILABILITY — `logo_url ?? logo_dark_url` — which is
 * correct when only one variant exists and wrong the moment both do: it puts
 * the white mark on a white product shot. The white mark exists FOR dark
 * footage and the black one FOR light, so the backdrop has to decide.
 *
 * Measured, not asked. A model shown the image could answer "is this dark?",
 * but that costs a call, takes seconds, and can be wrong — where the answer is
 * literally the average luminance of the pixels the logo will cover.
 */

const BOTH = { logo_url: "white.png", logo_dark_url: "black.png" };

describe("relativeLuminance", () => {
  it("puts black at 0 and white at 1", () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
  });

  it("weights green most, as human vision does", () => {
    // Rec. 709. A naive average would call these three equal and pick the
    // wrong mark on strongly coloured artwork.
    const g = relativeLuminance(0, 255, 0);
    const r = relativeLuminance(255, 0, 0);
    const b = relativeLuminance(0, 0, 255);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
  });
});

describe("pickContrastingLogo", () => {
  it("puts the white mark on a dark backdrop", () => {
    expect(pickContrastingLogo(BOTH, 0.1)).toBe("white.png");
  });

  it("puts the black mark on a light backdrop", () => {
    expect(pickContrastingLogo(BOTH, 0.9)).toBe("black.png");
  });

  it("disagrees with pickKitLogo exactly where it should", () => {
    // The bug being fixed, stated as a test: on a bright frame the old helper
    // returns the white mark and this one doesn't.
    expect(pickKitLogo(BOTH)).toBe("white.png");
    expect(pickContrastingLogo(BOTH, 0.9)).toBe("black.png");
  });

  it("falls back to whatever exists when only one variant is stored", () => {
    // A half-configured kit must still stamp something rather than nothing.
    expect(
      pickContrastingLogo({ logo_url: "white.png" }, 0.9),
    ).toBe("white.png");
    expect(
      pickContrastingLogo({ logo_dark_url: "black.png" }, 0.1),
    ).toBe("black.png");
  });

  it("returns null only when the kit has no logo at all", () => {
    expect(pickContrastingLogo({}, 0.5)).toBeNull();
  });

  it("treats an unmeasurable backdrop as no opinion, not as dark", () => {
    // sampleBackdropLuminance returns null on CORS/decode failure. Reading that
    // as 0 would silently force the white mark onto light artwork.
    expect(pickContrastingLogo(BOTH, null)).toBe("white.png");
  });
});
