import { describe, it, expect } from "vitest";
import { ADDONS, getAddonPlan, addonForPriceId } from "@/lib/billing/addons";

describe("ADDONS registry", () => {
  it("has exactly one add-on today: blend_package", () => {
    expect(ADDONS.map((a) => a.key)).toEqual(["blend_package"]);
  });

  it("getAddonPlan resolves the blend package", () => {
    expect(getAddonPlan("blend_package").name).toBe("Blend Package");
  });
});

describe("addonForPriceId", () => {
  it("returns undefined for an unrecognized price id", () => {
    expect(addonForPriceId("price_not_a_real_one")).toBeUndefined();
  });

  it("matches the configured blend addon price id when set", () => {
    const plan = getAddonPlan("blend_package");
    if (!plan.priceId) return; // not configured in this env — nothing to assert
    expect(addonForPriceId(plan.priceId)?.key).toBe("blend_package");
  });
});
