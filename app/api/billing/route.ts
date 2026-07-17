import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VISIBLE_PLANS, PACKS } from "@/lib/billing/plans";

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
      // VISIBLE_PLANS, not PLANS: a tier whose differentiators aren't built
      // must not be purchasable, and this route is what the billing page buys from.
      plans: VISIBLE_PLANS,
      packs: PACKS,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
