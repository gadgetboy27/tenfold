import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildModelReviewReport,
  sendModelReviewEmail,
} from "@/lib/models/review";

// GET /api/cron/model-review — monthly model refresh prompt. Assembles the model
// registries + variety-pack pick counts and emails the operator so a human can
// decide what to swap. Auth mirrors the analytics cron (Bearer CRON_SECRET).
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET || "dev-secret"}`;
  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const report = await buildModelReviewReport(admin);
  const emailed = await sendModelReviewEmail(report);
  return NextResponse.json({ emailed, report });
}
