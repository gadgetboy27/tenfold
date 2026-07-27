import { describe, it, expect } from "vitest";
import { entitlementsForTier, PRO_EFFECTS } from "@/lib/billing/entitlements";

describe("entitlementsForTier — proEffects must agree with the compositing gate", () => {
  it("does NOT bundle blend free on Business (it requires the Blend Package add-on)", () => {
    // Regression guard: this exact drift shipped once — proEffects said
    // Business had free "blend" while lib/compositing/access.ts already
    // required the add-on, so the Studio UI showed an unlocked button the
    // API would 403. getEntitlements() patches "blend" back in dynamically
    // only when the add-on is active; the STATIC list must stay addon-free.
    expect(entitlementsForTier("business").proEffects).not.toContain("blend");
  });

  it("still bundles removebg and borders free on Business", () => {
    const effects = entitlementsForTier("business").proEffects;
    expect(effects).toContain("removebg");
    expect(effects).toContain("borders");
  });

  it("bundles every effect, including blend, free on Agency", () => {
    const effects = entitlementsForTier("agency").proEffects;
    for (const key of PRO_EFFECTS) expect(effects).toContain(key);
  });

  it("gives payg and creator no blend either", () => {
    expect(entitlementsForTier("payg").proEffects).not.toContain("blend");
    expect(entitlementsForTier("creator").proEffects).not.toContain("blend");
  });
});

describe("entitlementsForTier — spokesperson is Business+, not merely paid", () => {
  it("withholds spokesperson from payg and creator", () => {
    expect(entitlementsForTier("payg").spokesperson).toBe(false);
    expect(entitlementsForTier("creator").spokesperson).toBe(false);
  });

  it("grants spokesperson on business and agency", () => {
    expect(entitlementsForTier("business").spokesperson).toBe(true);
    expect(entitlementsForTier("agency").spokesperson).toBe(true);
  });

  it("does not track isPro — creator is paid but still has no spokesperson", () => {
    // The point of the separate flag. A run costs 130 credits against 5–8 for
    // the other add-on tools, so it is deliberately not bundled at Creator.
    // Collapsing this back to `isPro` (as /api/talking-video once did) would
    // hand every $29 subscriber the most expensive job in the product.
    const creator = entitlementsForTier("creator");
    expect(creator.isPro).toBe(true);
    expect(creator.spokesperson).toBe(false);
  });
});
