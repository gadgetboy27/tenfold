import { describe, it, expect } from "vitest";
import { ASPECT_DESIGN } from "@/lib/composition/layers";
import {
  PLATFORM_FORMATS,
  formatsForPlatforms,
  distinctAspects,
  zoneIntrusions,
  intersectionArea,
  isPlatformId,
  type NormRect,
} from "@/lib/composition/formats";

describe("platform format registry", () => {
  it("keeps every entry internally consistent with the design space", () => {
    for (const [key, f] of Object.entries(PLATFORM_FORMATS)) {
      expect(f.id).toBe(key); // key matches id
      const design = ASPECT_DESIGN[f.aspect];
      expect(design).toBeDefined();
      // Dimensions are the design space for that aspect.
      expect(f.width).toBe(design.width);
      expect(f.height).toBe(design.height);
    }
  });

  it("keeps every safe zone inside the normalized canvas", () => {
    for (const f of Object.values(PLATFORM_FORMATS)) {
      for (const z of f.safeZones) {
        expect(z.w).toBeGreaterThan(0);
        expect(z.h).toBeGreaterThan(0);
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.y).toBeGreaterThanOrEqual(0);
        expect(z.x + z.w).toBeLessThanOrEqual(1.0000001);
        expect(z.y + z.h).toBeLessThanOrEqual(1.0000001);
        expect(z.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses the canonical publish slugs as keys", () => {
    // A representative slice of lib/validation/schemas.ts publishSchema.
    expect(isPlatformId("tiktok")).toBe(true);
    expect(isPlatformId("twitter")).toBe(true); // NOT "x"
    expect(isPlatformId("gmb")).toBe(true);
    expect(isPlatformId("x")).toBe(false);
    expect(isPlatformId("myspace")).toBe(false);
  });
});

describe("formatsForPlatforms", () => {
  it("maps connected slugs to formats, dropping unknowns and duplicates", () => {
    const formats = formatsForPlatforms([
      "tiktok",
      "instagram",
      "linkedin",
      "myspace", // unknown → dropped
      "tiktok", // duplicate → collapsed
    ]);
    expect(formats.map((f) => f.id)).toEqual([
      "tiktok",
      "instagram",
      "linkedin",
    ]);
  });

  it("returns an empty list when nothing connected is recognised", () => {
    expect(formatsForPlatforms(["myspace", "vine"])).toEqual([]);
  });
});

describe("distinctAspects", () => {
  it("collapses formats to the aspects the export must render once each", () => {
    // tiktok(9:16) + instagram(9:16) + linkedin(1:1) + youtube(16:9)
    const formats = formatsForPlatforms([
      "tiktok",
      "instagram",
      "linkedin",
      "youtube",
    ]);
    expect(distinctAspects(formats)).toEqual(["9:16", "1:1", "16:9"]);
  });
});

describe("zoneIntrusions", () => {
  const tiktok = PLATFORM_FORMATS.tiktok;

  it("flags a caption-area layer as intruding on the bottom strip", () => {
    // A wide text block sitting low in frame, like a burned-in caption.
    const box: NormRect = { x: 0.1, y: 0.82, w: 0.6, h: 0.1 };
    const hits = zoneIntrusions(box, tiktok);
    expect(hits.some((z) => z.label.includes("caption"))).toBe(true);
  });

  it("does not flag a centred layer clear of all chrome", () => {
    const box: NormRect = { x: 0.35, y: 0.35, w: 0.3, h: 0.2 };
    expect(zoneIntrusions(box, tiktok)).toEqual([]);
  });

  it("ignores a hairline clip below the threshold", () => {
    // Box just barely grazes the bottom strip (starts at 0.78) — tiny overlap.
    const box: NormRect = { x: 0.1, y: 0.7, w: 0.5, h: 0.082 };
    // Overlap height ~0.002 of a 0.082-tall box → ~2.4%, under the 10% default.
    expect(zoneIntrusions(box, tiktok)).toEqual([]);
  });

  it("returns nothing for a format with no safe zones", () => {
    const box: NormRect = { x: 0, y: 0, w: 1, h: 1 };
    expect(zoneIntrusions(box, PLATFORM_FORMATS.linkedin)).toEqual([]);
  });
});

describe("intersectionArea", () => {
  it("is zero for disjoint rects and positive for overlap", () => {
    expect(
      intersectionArea(
        { x: 0, y: 0, w: 0.2, h: 0.2 },
        { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
      ),
    ).toBe(0);
    expect(
      intersectionArea(
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      ),
    ).toBeCloseTo(0.0625); // 0.25 * 0.25
  });
});
