import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// GET /api/analytics/styles — "which AI-generated styles perform best"
// (PRODUCT_STRATEGY.md §4), ranked by the normalized engagement score
// POST /api/analytics/refresh computes. Reads the style_performance() SQL
// function (db/migrations/0025_publish_analytics.sql) — workspace-scoped,
// so this workspace's post performance never leaks to another.
export const GET = withWorkspace(async (_req, { db, session }) => {
  const { data, error } = await db.rpc("style_performance", {
    p_workspace_id: session.workspaceId,
  });
  if (error) throw new Error(error.message);

  return NextResponse.json({ styles: data ?? [] });
});
