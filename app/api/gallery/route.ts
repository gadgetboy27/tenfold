import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// GET /api/gallery — every image the workspace has ever generated, across all
// campaigns. These are assets the user already paid to create, kept here as a
// reusable holding area. Finished VIDEOS live in /api/productions instead.
// Excludes derived HD upscales by default.
export const GET = withWorkspace(async (_req, { db }) => {
  const { data } = await db
    .from("assets")
    .select("id, url, type, campaign_id, metadata, created_at")
    .in("type", ["image", "composed_image"])
    .order("created_at", { ascending: false })
    .limit(300);

  const assets = (data ?? []).filter((a) => {
    const meta = a.metadata as { hd?: boolean; kind?: string } | null;
    // Exclude derived HD upscales, logo brand-package zips (image-type rows
    // that aren't viewable images), and the normalised frame a video was
    // generated from — that one is a working copy of the anchor, so listing it
    // would offer the user a near-identical duplicate to choose between.
    return (
      !meta?.hd && meta?.kind !== "logo_bundle" && meta?.kind !== "video_source"
    );
  });
  return NextResponse.json({ assets });
});
