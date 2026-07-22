import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLANS, PACKS } from "@/lib/billing/plans";
import { ADDONS } from "@/lib/billing/addons";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const [subRes, accountRes, txRes, addonsRes] = await Promise.all([
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
      admin
        .from("workspace_addons")
        .select("addon_key, status")
        .eq("workspace_id", session.workspaceId),
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
