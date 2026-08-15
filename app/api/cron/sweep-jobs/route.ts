import { NextResponse } from "next/server";
import { sweepStalledJobs, STALL_MINUTES } from "@/lib/jobs/sweep";

// GET /api/cron/sweep-jobs — settle fal jobs whose webhook never arrived.
//
// Every terminal outcome for a fal job, refunds included, runs through the fal
// webhook. A webhook that never fires therefore strands the user's credits with
// no recovery path anywhere in the app. This is that path. Auth mirrors the
// analytics and model-review crons (Bearer CRON_SECRET).
//
// ?dryRun=1 reports what it WOULD do without writing — worth running first
// against production, since this both moves credits and marks jobs terminal.
// ?minutes=N overrides the staleness threshold (floored at 15 to make it hard
// to fat-finger a sweep of live jobs).
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET || "dev-secret"}`;
  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const requested = Number(url.searchParams.get("minutes"));
  const stallMinutes =
    Number.isFinite(requested) && requested > 0
      ? Math.max(15, requested)
      : STALL_MINUTES;

  try {
    const result = await sweepStalledJobs({ stallMinutes, dryRun });

    // The select is capped at 200; hitting it means there's a backlog the next
    // run will continue. Say so rather than reporting a clean sweep.
    const truncated = result.examined === 200;

    return NextResponse.json({
      dryRun,
      stallMinutes,
      truncated,
      ...result,
    });
  } catch (error) {
    console.error("Job sweep error:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
