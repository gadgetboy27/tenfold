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
  // The FK is named EXPLICITLY, and it has to be.
  //
  // `campaigns(name)` worked while assets↔campaigns had exactly one foreign
  // key. Migration 0032 added a second in the other direction
  // (campaigns.publish_asset_id → assets.id), and PostgREST then refused to
  // guess which relationship the embed meant. The query started erroring —
  // and because the error was discarded below, the page reported "No finished
  // videos yet" to a workspace holding nine of them.
  //
  // Two lessons, both applied here: disambiguate an embed the moment a table
  // pair can have more than one relationship, and never destructure only
  // `data` off a Supabase call — a swallowed error becomes an empty state,
  // which is indistinguishable from the truth and far harder to notice.
  const { data, error } = await db
    .from("assets")
    .select(
      "id, url, type, campaign_id, metadata, created_at, campaigns!assets_campaign_id_fkey(name)",
    )
    .in("type", types.length > 0 ? types : ["composed_video"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    // Surfaced, not swallowed. An empty list here reads as "you have made
    // nothing", which is a lie the user cannot tell from a broken query.
    return NextResponse.json(
      { error: `Couldn't load your productions: ${error.message}` },
      { status: 500 },
    );
  }

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
