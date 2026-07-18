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
    // Exclude derived HD upscales and logo brand-package zips (stored as
    // image-type asset rows but not viewable images).
    return !meta?.hd && meta?.kind !== "logo_bundle";
  });
  return NextResponse.json({ assets });
});
