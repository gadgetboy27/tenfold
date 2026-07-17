/**
 * Subscription plans and credit top-up packs — single source of truth.
 * Consumed by the billing API (app/api/billing/route.ts) and the public
 * pricing page (app/pricing/page.tsx) so the two can never drift apart.
 * priceId reads env at module load, so this module is server-side only.
 */

export interface Plan {
  id: string;
  name: string;
  priceNzd: number;
  creditsPerMonth: number;
  priceId: string | null;
  /**
   * What this plan actually delivers TODAY.
   *
   * Every bullet must map to an entitlement that something reads. Half of the
   * entitlements in lib/billing/entitlements.ts are declared and read by
   * nothing (priorityQueue, advancedAnalytics, maxWorkspaces, whiteLabel,
   * apiAccess) — four of them were being sold here. Check before adding one:
   *   grep -rn "ent\.<flag>" app/ components/ lib/
   */
  features: string[];
  popular?: boolean;
  /** Hidden from pricing. For a tier whose differentiators aren't built yet —
   *  the plan stays defined (Stripe price, entitlements) so turning it back on
   *  is a one-line change, but nobody can buy what we can't deliver. */
  hidden?: boolean;
}

export interface Pack {
  credits: number;
  priceNzd: number;
  priceId: string | null;
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "creator",
    name: "Creator",
    priceNzd: 29,
    creditsPerMonth: 350,
    priceId: process.env.STRIPE_PRICE_CREATOR_MONTHLY ?? null,
    features: [
      "350 credits / month",
      "Image generation",
      "Music & captions",
      "Brand kit",
    ],
  },
  {
    id: "business",
    name: "Business",
    priceNzd: 79,
    creditsPerMonth: 1000,
    priceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? null,
    // Only what is actually built and enforced. "Priority queue" and
    // "Analytics" were listed here and neither exists — their entitlement
    // flags (priorityQueue, advancedAnalytics) are declared in
    // lib/billing/entitlements.ts and read by nothing. Selling them was the
    // same shape as the credit table that drifted into fiction: written as
    // intent, never reconciled.
    features: [
      "1,000 credits / month",
      "All formats incl. 30s video",
      "HD / print-ready exports",
      "6 directions per campaign",
    ],
    popular: true,
  },
  {
    id: "agency",
    name: "Agency",
    priceNzd: 249,
    creditsPerMonth: 3000,
    priceId: process.env.STRIPE_PRICE_AGENCY_MONTHLY ?? null,
    features: ["3,000 credits / month", "All formats"],
    // Hidden until it has something to sell.
    //
    // Its two differentiators were "Up to 5 workspaces" and "White-label
    // exports". Neither exists: maxWorkspaces and whiteLabel are read by
    // nothing, and there is no way to create a second workspace at all — so a
    // customer paying NZD 249 would find the tier identical to Business apart
    // from the credit count, at exactly the same price per credit. That is not
    // a tier, it is a bigger Business with two promises attached.
    //
    // Turn this off once white-label or multi-workspace ships. Everything else
    // (Stripe price, entitlements, credit grant) stays wired, so the tier works
    // the moment it's honest.
    hidden: true,
  },
];

/** Plans a customer may actually buy. */
export const VISIBLE_PLANS: Plan[] = PLANS.filter((p) => !p.hidden);

// Two top-ups only — a low-commitment trial and a value pack. Kept deliberately
// minimal so the billing area isn't cluttered; subscriptions are the main path.
export const PACKS: Pack[] = [
  { credits: 25, priceNzd: 15, priceId: process.env.STRIPE_PRICE_25CR ?? null },
  {
    credits: 300,
    priceNzd: 119,
    priceId: process.env.STRIPE_PRICE_300CR ?? null,
    popular: true,
  },
];
