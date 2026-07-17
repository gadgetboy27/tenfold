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
  features: string[];
  popular?: boolean;
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
      "No tenfold watermark",
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
    features: [
      "1,000 credits / month",
      "All formats incl. video",
      "Priority queue",
      "Analytics",
    ],
    popular: true,
  },
  {
    id: "agency",
    name: "Agency",
    priceNzd: 249,
    creditsPerMonth: 3000,
    priceId: process.env.STRIPE_PRICE_AGENCY_MONTHLY ?? null,
    features: [
      "3,000 credits / month",
      "All formats",
      "Up to 5 workspaces",
      "White-label exports",
    ],
  },
];

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
