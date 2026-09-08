import { describe, it, expect } from "vitest";
import {
  formatsForPlatforms,
  distinctAspects,
} from "@/lib/composition/formats";

/**
 * Render for the platforms you actually publish to.
 *
 * The fan-out renders one file per ASPECT — safe zones change the ⚠ overlay,
 * not the pixels — but nobody thinks in aspects. They think "the TikTok one".
 * So: render by aspect (no wasted work), label by platform (the words the user
 * is holding it for). These pin that the two stay reconcilable.
 */

describe("platform-scoped render", () => {
  it("renders one file per shape, not one per platform", () => {
    // Facebook and Instagram both take 1:1 here — rendering twice would be
    // identical pixels and double the FFmpeg bill.
    const formats = formatsForPlatforms(["facebook", "instagram", "tiktok"]);
    const aspects = distinctAspects(formats);
    expect(formats.length).toBeGreaterThanOrEqual(aspects.length);
    expect(new Set(aspects).size).toBe(aspects.length);
  });

  it("every rendered aspect maps back to at least one platform", () => {
    // The label is derived from this. An aspect with no platform behind it
    // would render a file the UI can't name.
    const formats = formatsForPlatforms(["tiktok", "facebook", "instagram"]);
    for (const a of distinctAspects(formats)) {
      expect(formats.filter((f) => f.aspect === a).length).toBeGreaterThan(0);
    }
  });

  it("ignores platforms with no format registered", () => {
    expect(formatsForPlatforms(["not-a-platform"])).toEqual([]);
    expect(distinctAspects([])).toEqual([]);
  });

  it("de-dupes a platform listed twice", () => {
    // Two connected accounts on the same network must not double the render.
    expect(formatsForPlatforms(["tiktok", "tiktok"])).toHaveLength(1);
  });

  it("TikTok asks for a vertical cut", () => {
    const [tiktok] = formatsForPlatforms(["tiktok"]);
    expect(tiktok.aspect).toBe("9:16");
  });
});
