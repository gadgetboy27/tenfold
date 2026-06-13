import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PLANS = [
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
    priceNzd: 89,
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

const PACKS = [
  { credits: 25, priceNzd: 15, priceId: process.env.STRIPE_PRICE_25CR ?? null },
  {
    credits: 100,
    priceNzd: 49,
    priceId: process.env.STRIPE_PRICE_100CR ?? null,
    popular: true,
  },
  {
    credits: 300,
    priceNzd: 119,
    priceId: process.env.STRIPE_PRICE_300CR ?? null,
  },
];

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const [subRes, accountRes, txRes] = await Promise.all([
      admin
        .from("subscriptions")
        .select("*")
        .eq("workspace_id", session.workspaceId)
        .single(),
      admin
        .from("credit_accounts")
        .select("cached_balance")
        .eq("workspace_id", session.workspaceId)
        .single(),
      admin
        .from("credit_transactions")
        .select("*")
        .eq("workspace_id", session.workspaceId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    return NextResponse.json({
      subscription: subRes.data ?? null,
      balance:
        (accountRes.data as { cached_balance: number } | null)
          ?.cached_balance ?? 0,
      transactions: txRes.data ?? [],
      plans: PLANS,
      packs: PACKS,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
