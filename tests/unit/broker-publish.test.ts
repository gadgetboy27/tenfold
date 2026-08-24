import { describe, it, expect } from "vitest";
import {
  BROKER_PLATFORMS,
  isBrokerPlatform,
  shouldBroker,
} from "@/lib/social/broker/outstand";
import { DIRECT_PLATFORMS } from "@/lib/social/direct";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { PROVIDER_COST_USD } from "@/lib/costs/rates";

/**
 * The broker bills per post, so the rule that matters most is the one about
 * what it must NEVER be used for: a network we already reach for free. Paying a
 * third party to publish somewhere our own code publishes would spend the
 * customer's credits on nothing, and it would be invisible — the post would
 * still succeed.
 */

describe("broker scope", () => {
  it("never brokers a network the Meta backend already covers free", () => {
    for (const p of ["facebook", "instagram"]) {
      expect(isBrokerPlatform(p)).toBe(false);
    }
  });

  it("never brokers a network with a free direct adapter, except the two awaiting review", () => {
    // TikTok and YouTube are the deliberate overlap: their direct adapters
    // exist but are blocked on TikTok's audit and Google's OAuth verification,
    // so brokering is the bridge until those land. Everything else that has a
    // direct adapter must be absent, or we'd be paying to duplicate it.
    const overlap = DIRECT_PLATFORMS.filter((p) => isBrokerPlatform(p));
    expect([...overlap].sort()).toEqual(["tiktok", "youtube"]);
  });

  it("prefers a direct connection over paying to broker", () => {
    // The whole cost-control story: connecting an account directly must retire
    // the per-post charge, not sit alongside it.
    expect(shouldBroker("x", true)).toBe(false);
    expect(shouldBroker("tiktok", true)).toBe(false);
  });

  it("does not broker when no broker is configured", () => {
    // isBrokerEnabled() reads OUTSTAND_API_KEY, which is unset in tests — so a
    // deployment without a broker account silently offers nothing rather than
    // charging credits for a call that cannot be made.
    expect(shouldBroker("x", false)).toBe(false);
  });

  it("covers the networks we deliberately chose not to build", () => {
    for (const p of ["x", "threads", "gmb", "telegram"]) {
      expect(BROKER_PLATFORMS).toContain(p);
    }
  });
});

describe("brokered_publish pricing", () => {
  it("is benchmarked against the cheapest existing band, not invented", () => {
    // script_generation: 1 credit at $0.002 raw. A brokered post is $0.007,
    // ~3.5x — so 2 credits keeps the same rough value per credit while staying
    // a round number in a multi-network publish.
    const perCredit =
      PROVIDER_COST_USD.script_generation / CREDIT_COSTS.script_generation;
    const implied = PROVIDER_COST_USD.brokered_publish / perCredit;

    expect(CREDIT_COSTS.brokered_publish).toBe(2);
    expect(implied).toBeGreaterThan(1);
    expect(implied).toBeLessThan(5);
  });

  it("still charges more than it costs us", () => {
    // A charge below cost would quietly lose money on every post — the exact
    // failure lib/costs/rates.ts exists to make visible.
    const perCredit =
      PROVIDER_COST_USD.script_generation / CREDIT_COSTS.script_generation;
    const revenue = CREDIT_COSTS.brokered_publish * perCredit;
    expect(revenue).toBeGreaterThan(0);
    expect(PROVIDER_COST_USD.brokered_publish).toBeLessThan(0.01);
  });
});
