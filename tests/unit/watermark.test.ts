import { describe, it, expect } from "vitest";
import { entitlementsForTier, type Tier } from "@/lib/billing/entitlements";
import { isVideoAsset } from "@/lib/util/asset-kind";

/**
 * The watermark is a revenue mechanic: if it leaks onto a paying workspace we
 * annoy a customer, and if it silently stops applying to free workspaces we
 * lose the advertising the free tier is paying us in. Both directions are
 * pinned here.
 */

const PAID: Tier[] = ["creator", "business", "agency"];

describe("watermark entitlement", () => {
  it("stamps the free tier", () => {
    expect(entitlementsForTier("payg").watermarkFree).toBe(false);
  });

  it("lifts on every paid tier", () => {
    for (const tier of PAID) {
      expect(entitlementsForTier(tier).watermarkFree).toBe(true);
    }
  });

  it("treats an unknown or missing tier as free — never as paid", () => {
    // A typo'd or newly-added tier must fail CLOSED (watermarked), so a bad
    // subscription row can never hand out watermark-free posts for nothing.
    for (const tier of [null, undefined, "", "enterprise", "PAYG"]) {
      expect(entitlementsForTier(tier).watermarkFree).toBe(false);
    }
  });

  it("keeps white-label distinct from watermark removal", () => {
    // Creator/Business are watermark-free but NOT white-label — white-label is
    // the Agency differentiator. Collapsing the two would give away the $249
    // tier's selling point.
    expect(entitlementsForTier("creator").whiteLabel).toBe(false);
    expect(entitlementsForTier("business").whiteLabel).toBe(false);
    expect(entitlementsForTier("agency").whiteLabel).toBe(true);
  });

  it("never grants white-label without watermark removal", () => {
    // A white-label export carrying our mark would be self-contradictory.
    for (const tier of ["payg", ...PAID] as Tier[]) {
      const ent = entitlementsForTier(tier);
      if (ent.whiteLabel) expect(ent.watermarkFree).toBe(true);
    }
  });
});

describe("asset kind routing", () => {
  // Picking the wrong branch doesn't just misplace the mark — it hands an MP4
  // to sharp, which throws, and the stamp is silently skipped.
  it("routes every video shape to the video stamper", () => {
    expect(isVideoAsset({ type: "video", url: "https://x/a.mp4" })).toBe(true);
    // The compositor's own type — an `=== "video"` test misses this one.
    expect(
      isVideoAsset({ type: "composed_video", url: "https://x/b.mp4" }),
    ).toBe(true);
    // Type unknown but the extension gives it away.
    expect(isVideoAsset({ type: "asset", url: "https://x/c.MP4" })).toBe(true);
    // Query strings must not defeat the extension check — storage URLs carry them.
    expect(
      isVideoAsset({ type: "asset", url: "https://x/d.mp4?token=1" }),
    ).toBe(true);
  });

  it("leaves stills to the image stamper", () => {
    expect(isVideoAsset({ type: "image", url: "https://x/a.jpg" })).toBe(false);
    expect(
      isVideoAsset({ type: "composed_image", url: "https://x/b.png" }),
    ).toBe(false);
    // "mp4" inside the name is not an extension.
    expect(
      isVideoAsset({ type: "image", url: "https://x/mp4-promo.jpg" }),
    ).toBe(false);
  });
});
