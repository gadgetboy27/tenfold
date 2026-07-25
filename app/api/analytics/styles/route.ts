import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET /api/analytics/styles — "which AI-generated styles perform best"
// (PRODUCT_STRATEGY.md §4), ranked by the normalized engagement score
// POST /api/analytics/refresh computes. Reads the style_performance() SQL
// function (db/migrations/0025_publish_analytics.sql) — workspace-scoped,
// so this workspace's post performance never leaks to another.
export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin.rpc("style_performance", {
      p_workspace_id: session.workspaceId,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ styles: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized" ? 401 : msg === "Not a workspace member" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
