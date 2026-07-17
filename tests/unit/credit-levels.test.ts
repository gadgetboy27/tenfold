import { describe, it, expect } from "vitest";
import {
  creditLevel,
  creditFillFraction,
  CREDIT_LOW,
  CREDIT_WARNING,
} from "@/lib/billing/credit-levels";
import { CREDIT_COSTS } from "@/lib/credits/costs";

/**
 * The bug these guard: the sidebar gauge and the top-bar meter each carried
 * their own rule, so the same balance rendered red in one and amber in the
 * other, and a fresh Creator's bar sat at 70% having spent nothing.
 */

describe("credit level", () => {
  it("agrees with itself across the boundaries", () => {
    expect(creditLevel(0)).toBe("low");
    expect(creditLevel(CREDIT_LOW - 1)).toBe("low");
    expect(creditLevel(CREDIT_LOW)).toBe("warning");
    expect(creditLevel(CREDIT_WARNING - 1)).toBe("warning");
    expect(creditLevel(CREDIT_WARNING)).toBe("ok");
    expect(creditLevel(3000)).toBe("ok");
  });

  it("stays anchored to what the credits actually buy", () => {
    // The thresholds are only meaningful relative to real costs. If a 30s video
    // ever costs more than the warning line, "warning" stops meaning "you're
    // within one big render of empty" and the numbers need rethinking.
    expect(CREDIT_LOW).toBeLessThan(CREDIT_COSTS.video_30s);
    expect(CREDIT_WARNING).toBeGreaterThanOrEqual(CREDIT_COSTS.video_30s);
  });

  it("reports the specific balances that used to render two colours at once", () => {
    // 75 was red in the sidebar (15% of a hardcoded 500) and amber in the meter.
    expect(creditLevel(75)).toBe("warning");
    // 200 was amber in the sidebar (40%) and normal in the meter.
    expect(creditLevel(200)).toBe("ok");
  });
});

describe("credit gauge fill", () => {
  it("reads full for a healthy balance on every tier", () => {
    // The old gauge divided by a 500-credit ceiling no plan has: a freshly-paid
    // Creator (350/mo) opened to a 70% bar, and Agency (3000/mo) never moved.
    for (const monthlyAllowance of [350, 1000, 3000]) {
      expect(creditFillFraction(monthlyAllowance)).toBe(1);
    }
  });

  it("drains in step with the colour, never out of range", () => {
    expect(creditFillFraction(0)).toBe(0);
    expect(creditFillFraction(CREDIT_WARNING / 2)).toBeCloseTo(0.5);
    expect(creditFillFraction(CREDIT_WARNING)).toBe(1);
    // A pack top-up can exceed the denominator — must clamp, not overflow.
    expect(creditFillFraction(10_000)).toBe(1);
    // Refund races have produced negative balances before; don't render a
    // negative-width bar.
    expect(creditFillFraction(-5)).toBe(0);
  });
});
