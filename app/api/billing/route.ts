import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { PLANS, PACKS } from "@/lib/billing/plans";
import { ADDONS } from "@/lib/billing/addons";

// GET /api/billing — the workspace's subscription, balance and recent ledger.
// Every table here is in WORKSPACE_SCOPED_TABLES, so `db` applies the tenant
// filter the old code wrote four times by hand.
export const GET = withWorkspace(
  async (_req, { db }) => {
    const [subRes, accountRes, txRes, addonsRes] = await Promise.all([
      db.from("subscriptions").select("*").single(),
      db.from("credit_accounts").select("cached_balance").single(),
      db
        .from("credit_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("workspace_addons").select("addon_key, status"),
    ]);

    const activeAddons = (
      (addonsRes.data as { addon_key: string; status: string }[] | null) ?? []
    )
      .filter((a) => a.status === "active" || a.status === "past_due")
      .map((a) => a.addon_key);

    return NextResponse.json({
      subscription: subRes.data ?? null,
      balance:
        (accountRes.data as { cached_balance: number } | null)
          ?.cached_balance ?? 0,
      transactions: txRes.data ?? [],
      plans: PLANS,
      packs: PACKS,
      addons: ADDONS,
      activeAddons,
    });
  },
  { rateLimit: false },
);
