import { describe, it, expect } from "vitest";
import { ASPECT_DESIGN } from "@/lib/composition/layers";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { PROVIDER_COST_USD } from "@/lib/costs/rates";
import { entitlementsForTier } from "@/lib/billing/entitlements";
import {
  PLATFORM_FORMATS,
  formatsForPlatforms,
  distinctAspects,
  zoneIntrusions,
  intersectionArea,
  isPlatformId,
  railFormats,
  formatWarnings,
  pickForPlatform,
  PLATFORM_DURATION,
  snapToGenTier,
  recommendVideoDuration,
  overLengthPlatforms,
  GENERIC_RAIL,
  VIDEO_GEN_TIERS,
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

describe("railFormats", () => {
  it("maps connected platforms to rail items", () => {
    const rail = railFormats(["tiktok", "linkedin"]);
    expect(rail.map((r) => r.key)).toEqual(["tiktok", "linkedin"]);
    expect(rail[0]).toMatchObject({ label: "TikTok", aspect: "9:16" });
    expect(rail[0].safeZones.length).toBeGreaterThan(0);
  });

  it("falls back to the generic aspect trio when nothing is connected", () => {
    expect(railFormats([])).toBe(GENERIC_RAIL);
    expect(railFormats(["myspace"])).toBe(GENERIC_RAIL);
    expect(GENERIC_RAIL.map((r) => r.aspect)).toEqual(["9:16", "1:1", "16:9"]);
  });
});

describe("formatWarnings", () => {
  const { safeZones } = PLATFORM_FORMATS.tiktok;

  it("aggregates and dedupes intruded zones across many layer boxes", () => {
    const boxes: NormRect[] = [
      { x: 0.35, y: 0.35, w: 0.2, h: 0.2 }, // clear
      { x: 0.1, y: 0.82, w: 0.6, h: 0.1 }, // bottom caption
      { x: 0.05, y: 0.85, w: 0.5, h: 0.1 }, // bottom caption again (dedupe)
    ];
    const hits = formatWarnings(boxes, safeZones);
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toContain("caption");
  });

  it("returns nothing when every layer is clear", () => {
    const boxes: NormRect[] = [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }];
    expect(formatWarnings(boxes, safeZones)).toEqual([]);
  });
});

describe("video length guidance", () => {
  it("keeps a duration entry for every platform format (no drift)", () => {
    expect(Object.keys(PLATFORM_DURATION).sort()).toEqual(
      Object.keys(PLATFORM_FORMATS).sort(),
    );
    for (const d of Object.values(PLATFORM_DURATION)) {
      expect(d.recommended).toBeGreaterThan(0);
      expect(d.max).toBeGreaterThanOrEqual(d.recommended);
    }
  });

  it("snaps a target length to the nearest producible gen tier", () => {
    expect(snapToGenTier(6)).toBe(5);
    expect(snapToGenTier(12)).toBe(10);
    expect(snapToGenTier(25)).toBe(30); // closer to 30 than 10
    expect(snapToGenTier(40)).toBe(30);
  });

  it("recommends the shortest cross-platform sweet spot, snapped to a tier", () => {
    // TikTok + Instagram both ~30 → 30.
    expect(recommendVideoDuration(["tiktok", "instagram"])).toBe(30);
    // YouTube's ~55 sweet spot → snaps to 30 (max producible tier).
    expect(recommendVideoDuration(["youtube"])).toBe(30);
    // Mixed: Pinterest's 15 is shortest → lands EXACTLY on the 15s tier.
    // Before 15s existed this snapped down to 10, quietly shipping Pinterest a
    // clip a third shorter than its own sweet spot.
    expect(recommendVideoDuration(["pinterest", "tiktok"])).toBe(15);
    // Nothing recognised → 30 default.
    expect(recommendVideoDuration([])).toBe(30);
  });

  it("flags platforms a too-long video exceeds", () => {
    // 90s clip: over Snapchat (60) and GMB (30), fine for TikTok (600).
    expect(
      overLengthPlatforms(90, ["snapchat", "tiktok", "gmb"]).sort(),
    ).toEqual(["gmb", "snapchat"]);
    expect(overLengthPlatforms(20, ["snapchat", "tiktok"])).toEqual([]);
  });
});

describe("pickForPlatform", () => {
  const byAspect = new Map<string, string>([
    ["9:16", "vertical.mp4"],
    ["16:9", "wide.mp4"],
  ]);

  it("posts each platform its format's render, falling back otherwise", () => {
    expect(pickForPlatform("tiktok", byAspect, "fallback.mp4")).toBe(
      "vertical.mp4", // TikTok is 9:16
    );
    expect(pickForPlatform("youtube", byAspect, "fallback.mp4")).toBe(
      "wide.mp4", // YouTube is 16:9
    );
    // Facebook is 1:1 — not in the map → fallback.
    expect(pickForPlatform("facebook", byAspect, "fallback.mp4")).toBe(
      "fallback.mp4",
    );
    // Unknown platform → fallback.
    expect(pickForPlatform("myspace", byAspect, "fallback.mp4")).toBe(
      "fallback.mp4",
    );
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

describe("video tiers stay wired end to end", () => {
  it("prices every generatable length", () => {
    // A tier with no credit cost would crash at the debit; a cost with no tier
    // is unreachable. 15s existed as neither until it was added to both.
    for (const t of VIDEO_GEN_TIERS) {
      expect(
        CREDIT_COSTS[`video_${t}s` as keyof typeof CREDIT_COSTS],
      ).toBeGreaterThan(0);
      expect(PROVIDER_COST_USD[`video_${t}s`]).toBeGreaterThan(0);
    }
  });

  it("offers every tier to at least one plan", () => {
    // A length nobody can select is dead code with a price tag.
    for (const t of VIDEO_GEN_TIERS) {
      const reachable = (
        ["payg", "creator", "business", "agency"] as const
      ).some((tier) => entitlementsForTier(tier).videoDurations.includes(t));
      expect(reachable, `no plan can generate ${t}s`).toBe(true);
    }
  });

  it("keeps the free tier off video entirely", () => {
    expect(entitlementsForTier("payg").videoDurations).toEqual([]);
  });
});
