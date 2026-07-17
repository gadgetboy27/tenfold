import { describe, it, expect, afterEach } from "vitest";
import { isEnabled } from "@/lib/flags";

/**
 * The feature-flag gate. A flag must fail CLOSED — anything but an exact "1"
 * is off — so a typo, a leftover "true", or an unset var can never
 * dark-launch a half-built feature into production by accident.
 */

afterEach(() => {
  delete process.env.FEATURE_LOGO_BUILDER;
});

describe("isEnabled", () => {
  it("is on only for exactly '1'", () => {
    process.env.FEATURE_LOGO_BUILDER = "1";
    expect(isEnabled("logoBuilder")).toBe(true);
  });

  it("is off when unset", () => {
    expect(isEnabled("logoBuilder")).toBe(false);
  });

  it("fails closed on truthy-looking non-'1' values", () => {
    for (const v of ["0", "", "true", "yes", "on", "TRUE", " 1 "]) {
      process.env.FEATURE_LOGO_BUILDER = v;
      expect(isEnabled("logoBuilder"), `"${v}" must be OFF`).toBe(false);
    }
  });
});
