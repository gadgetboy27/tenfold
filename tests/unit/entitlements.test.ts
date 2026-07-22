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
