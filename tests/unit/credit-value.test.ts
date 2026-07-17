import { describe, it, expect } from "vitest";
import {
  creditValueUsd,
  PROVIDER_COST_USD,
  NZD_USD_RATE,
} from "@/lib/costs/rates";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { PLANS, PACKS } from "@/lib/billing/plans";

/**
 * A flat CREDIT_VALUE_USD = 0.1 used to price every credit here — a rate no
 * customer has ever paid. Subscribers pay ~$0.05 and packs $0.24–$0.37, so the
 * COGS tracker reported roughly double the real margin on the subscription
 * path and made loss-adjacent video look healthy.
 *
 * These pin the value to what is actually charged, so repricing a plan can
 * never again leave the margin maths quietly wrong.
 */

describe("credit value", () => {
  it("derives each tier's rate from the plan it is sold on", () => {
    for (const plan of PLANS) {
      const expected = (plan.priceNzd * NZD_USD_RATE) / plan.creditsPerMonth;
      expect(creditValueUsd(plan.id as "creator")).toBeCloseTo(expected, 6);
    }
  });

  it("values free welcome credits at nothing", () => {
    // The whole point. A job on granted credits earns $0 and costs real money;
    // calling it revenue is how a free tier looks profitable.
    expect(creditValueUsd("grant")).toBe(0);
  });

  it("prices payg off the pack people actually buy", () => {
    const pack = PACKS.find((p) => p.popular) ?? PACKS[0];
    expect(creditValueUsd("payg")).toBeCloseTo(
      (pack.priceNzd * NZD_USD_RATE) / pack.credits,
      6,
    );
  });

  it("never returns the old flat rate for anything", () => {
    // $0.10/credit was between the subscription and pack rates — close enough
    // to look plausible, wrong enough to double the reported margin.
    for (const s of [
      "grant",
      "payg",
      "creator",
      "business",
      "agency",
    ] as const) {
      expect(creditValueUsd(s)).not.toBeCloseTo(0.1, 3);
    }
  });

  it("subscription credits are far cheaper than pack credits", () => {
    // If this ever inverts, packs have stopped being the premium path and the
    // margin story changes completely.
    expect(creditValueUsd("creator")).toBeLessThan(creditValueUsd("payg"));
  });
});

describe("margin reality check", () => {
  const sub = creditValueUsd("creator");
  const markup = (type: keyof typeof CREDIT_COSTS) =>
    (CREDIT_COSTS[type] * sub) / PROVIDER_COST_USD[type];

  it("documents that video does NOT hit the 10x the model assumes", () => {
    // CLAUDE.md §1: "Every generative action costs credits at a 10x markup on
    // raw inference cost." It is not true for the flagship product, and this
    // test exists so that stays visible rather than being rediscovered.
    expect(markup("video_10s")).toBeLessThan(2);
    expect(markup("video_5s")).toBeLessThan(2);
    expect(markup("video_30s")).toBeLessThan(2.5);
    expect(markup("image_generation")).toBeLessThan(3);
  });

  it("flags if video is ever repriced to a healthy markup", () => {
    // Deliberately inverted: when video_10s clears 3x this fails, telling
    // whoever repriced it to update the assertion above and CLAUDE.md with it.
    expect(markup("video_10s")).toBeLessThan(3);
  });

  it("confirms a free signup's COGS ceiling is bounded", () => {
    // 50 welcome credits, one-time. The cap is the credits themselves — which
    // is why per-account daily caps add nothing on the free tier.
    const WELCOME = 50;
    const worst = Math.max(
      ...Object.entries(CREDIT_COSTS)
        .filter(([t]) => PROVIDER_COST_USD[t])
        .map(([t, cr]) => Math.floor(WELCOME / cr) * PROVIDER_COST_USD[t]),
    );
    expect(worst).toBeLessThan(2.5);
    // The genuinely expensive actions must stay unaffordable on the grant.
    expect(CREDIT_COSTS.video_30s).toBeGreaterThan(WELCOME);
    expect(CREDIT_COSTS.talking_video).toBeGreaterThan(WELCOME);
  });
});
