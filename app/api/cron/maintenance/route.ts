import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET /api/cron/maintenance — periodic housekeeping. Same CRON_SECRET gate as
// the analytics cron. Point a scheduler (Railway cron / an external ping) at it
// hourly.
//
// Today it sweeps stale rate_limits rows. The durable limiter upserts one row
// per key, so workspace-scoped keys stay tiny, but IP-scoped keys accumulate;
// this keeps the table from growing without bound. Add future sweeps here.
export async function GET(req: Request) {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET || "dev-secret"}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("cleanup_rate_limits", {
    p_older_than_seconds: 3600,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rateLimitsSwept: data ?? 0 });
}
