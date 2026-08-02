import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// The video asset types this route knows about. `composed_video` is a finished
// Compositor export; `video` is the raw Kling clip before branding.
const VIDEO_TYPES = ["composed_video", "video"] as const;

// GET /api/productions — the workspace's FINISHED videos (compositor exports),
// newest first, with their campaign name + the aspect/format tag. These are the
// completed, publish-ready products; the raw generated images live in /gallery.
//
// `?kinds=video,composed_video` widens it to raw clips as well — used by the
// GalleryPicker's video mode, where "a video I already made" reasonably means
// an un-branded clip too. Absent, the default stays exports-only.
export const GET = withWorkspace(async (req, { db }) => {
  const requested = new URL(req.url).searchParams.get("kinds");
  const types = requested
    ? requested
        .split(",")
        .map((k) => k.trim())
        .filter((k): k is (typeof VIDEO_TYPES)[number] =>
          (VIDEO_TYPES as readonly string[]).includes(k),
        )
    : [];
  const { data } = await db
    .from("assets")
    .select("id, url, type, campaign_id, metadata, created_at, campaigns(name)")
    .in("type", types.length > 0 ? types : ["composed_video"])
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
