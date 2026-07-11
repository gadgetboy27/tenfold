import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// GET /api/productions — the workspace's FINISHED videos (compositor exports),
// newest first, with their campaign name + the aspect/format tag. These are the
// completed, publish-ready products; the raw generated images live in /gallery.
export const GET = withWorkspace(async (_req, { db }) => {
  const { data } = await db
    .from("assets")
    .select("id, url, type, campaign_id, metadata, created_at, campaigns(name)")
    .eq("type", "composed_video")
    .order("created_at", { ascending: false })
    .limit(200);

  const productions = (data ?? []).map((a) => {
    const row = a as {
      id: string;
      url: string;
      campaign_id: string;
      metadata: { aspect?: string; format?: string } | null;
      created_at: string;
      campaigns?: { name?: string } | { name?: string }[] | null;
    };
    const camp = Array.isArray(row.campaigns)
      ? row.campaigns[0]
      : row.campaigns;
    return {
      id: row.id,
      url: row.url,
      campaignId: row.campaign_id,
      campaignName: camp?.name ?? "Untitled campaign",
      aspect: row.metadata?.aspect ?? null,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ productions });
});
