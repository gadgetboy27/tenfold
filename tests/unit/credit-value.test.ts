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

  it("prices every video length at ~3x inference", () => {
    // Video was repriced to ~3x after the flat-rate bug was fixed exposed it
    // running at 1.3–1.8x. It is deliberately NOT the 10x of CLAUDE.md §1:
    // 10x on a 10s clip is 188 credits — ONE video a month on Creator — or
    // Creator at NZD 218. The 10x model only holds where inference is ~free
    // (script 25x, music 20x); it cannot hold on the product we sell.
    for (const t of [
      "video_5s",
      "video_10s",
      "video_15s",
      "video_30s",
    ] as const) {
      expect(markup(t)).toBeGreaterThan(2.5);
      expect(markup(t)).toBeLessThan(3.5);
    }
  });

  it("keeps video length priced proportionally to its seconds", () => {
    // Kling bills per second, so credits must too — otherwise one length
    // quietly subsidises another. 15s should cost ~1.5x a 10s clip.
    const ratio = CREDIT_COSTS.video_15s / CREDIT_COSTS.video_10s;
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(1.6);
  });

  it("keeps the cheap actions where the 10x model does hold", () => {
    // These are the ones that fund the thin-margin video.
    expect(markup("script_generation")).toBeGreaterThan(10);
    expect(markup("music_generation")).toBeGreaterThan(10);
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

describe("valuing a grant by what it was, not the current tier", () => {
  it("prices a subscription grant by its amount, regardless of account status", async () => {
    const { subscriptionGrantTier } = await import("@/lib/costs/tracker");
    // The fix for churned subscribers: a paid subscription grant is identified
    // by its description + amount, so it keeps its value after the account
    // cancels (and reads "payg" now). 350 = Creator, 1000 = Business.
    expect(
      subscriptionGrantTier("grant", "Monthly subscription credits", 350),
    ).toBe("creator");
    expect(
      subscriptionGrantTier("grant", "Monthly subscription credits", 1000),
    ).toBe("business");
    expect(
      subscriptionGrantTier("grant", "Monthly subscription credits", 3000),
    ).toBe("agency");
  });

  it("treats a free welcome grant as free even at a plan-sized amount", async () => {
    const { subscriptionGrantTier } = await import("@/lib/costs/tracker");
    // The welcome grant and a subscription grant are BOTH type 'grant'; only the
    // description separates them. Without that guard a 50-credit welcome grant
    // (or an admin top-up that happens to be 350) would be counted as revenue.
    expect(
      subscriptionGrantTier("grant", "Welcome credits for abc", 50),
    ).toBeNull();
    expect(
      subscriptionGrantTier(
        "grant",
        "Admin test top-up (founder live testing)",
        350,
      ),
    ).toBeNull();
    expect(
      subscriptionGrantTier("grant", "Provisioned credits", 500),
    ).toBeNull();
  });

  it("ignores purchases and spends here (those are valued elsewhere)", async () => {
    const { subscriptionGrantTier } = await import("@/lib/costs/tracker");
    expect(
      subscriptionGrantTier("purchase", "Credit pack purchase", 300),
    ).toBeNull();
    expect(subscriptionGrantTier("spend", "image generation", 12)).toBeNull();
  });

  it("returns null for a subscription grant whose amount matches no plan", async () => {
    const { subscriptionGrantTier } = await import("@/lib/costs/tracker");
    // A prorated or partial grant we can't attribute to a tier is safer as $0
    // than guessed — under-counting revenue beats inventing it.
    expect(
      subscriptionGrantTier("grant", "Monthly subscription credits", 175),
    ).toBeNull();
  });
});
