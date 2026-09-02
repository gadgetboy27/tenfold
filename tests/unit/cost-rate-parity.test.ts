import { describe, it, expect } from "vitest";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { PROVIDER_COST_USD } from "@/lib/costs/rates";

/**
 * CLAUDE.md §6: these two files move together and neither is optional.
 *
 *   lib/credits/costs.ts  — what we charge the user, in credits
 *   lib/costs/rates.ts    — what the provider charges us, in USD
 *
 * "Changing one without the other silently changes the margin." That is not
 * hypothetical: `ad_watch` shipped charging 6 credits with no provider cost
 * recorded at all, so /api/analytics/usage reported it as pure margin while it
 * was in fact the most expensive Claude call in the app — an Opus 5 vision
 * request over six frames.
 *
 * A rule stated in a doc is a rule until someone is in a hurry. This makes a
 * NEW untracked action fail here instead of on a margin dashboard nobody reads
 * until the invoice looks wrong.
 */

/**
 * Actions charging credits with no provider cost recorded, as of 2026-09-03.
 *
 * This list may SHRINK, never grow. Each entry is a job type whose real cost
 * is currently unknown, which means its margin in /api/analytics/usage is
 * overstated by exactly that unknown amount. They predate the rule being
 * enforced; adding to this list rather than adding a rate is how the gap that
 * hid ad_watch gets recreated.
 */
const UNTRACKED = new Set([
  "image_variety",
  "layout_autofix",
  "composite_cutout",
  "composite_inpaint",
  "composite_relight",
  "composite_blend",
  "composite_depth",
]);

describe("every charged action has a known provider cost", () => {
  const charged = Object.keys(CREDIT_COSTS).filter(
    (k) => typeof CREDIT_COSTS[k as keyof typeof CREDIT_COSTS] === "number",
  );

  it("reads both files — an empty sweep would pass vacuously", () => {
    expect(charged.length).toBeGreaterThan(20);
    expect(Object.keys(PROVIDER_COST_USD).length).toBeGreaterThan(15);
  });

  for (const key of [
    "ad_watch",
    "video_10s",
    "video_15s",
    "video_30s",
    "image_generation",
  ]) {
    it(`${key} has a provider cost`, () => {
      expect(PROVIDER_COST_USD[key]).toBeGreaterThan(0);
    });
  }

  it("has no NEW untracked action", () => {
    const missing = charged.filter(
      (k) => PROVIDER_COST_USD[k] === undefined && !UNTRACKED.has(k),
    );
    expect(missing).toEqual([]);
  });

  it("keeps the untracked list honest — no stale entries", () => {
    // An entry that HAS a rate now, or no longer exists, must leave the list,
    // or the list slowly becomes a permanent excuse rather than a backlog.
    const stale = [...UNTRACKED].filter(
      (k) => PROVIDER_COST_USD[k] !== undefined || !charged.includes(k),
    );
    expect(stale).toEqual([]);
  });

  it("never prices an action below its provider cost", () => {
    // Credit value is defined in rates.ts; a job charging less than it costs
    // is a bug worth failing a build over, not a pricing preference.
    const CREDIT_VALUE_USD = 0.046;
    const underwater = charged
      .filter((k) => PROVIDER_COST_USD[k] !== undefined)
      .map((k) => ({
        k,
        revenue:
          (CREDIT_COSTS[k as keyof typeof CREDIT_COSTS] as number) *
          CREDIT_VALUE_USD,
        cost: PROVIDER_COST_USD[k],
      }))
      .filter((r) => r.revenue < r.cost)
      .map((r) => `${r.k}: $${r.revenue.toFixed(3)} < $${r.cost.toFixed(3)}`);
    expect(underwater).toEqual([]);
  });
});
