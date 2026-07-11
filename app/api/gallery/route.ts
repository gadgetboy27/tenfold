import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// GET /api/gallery — every finished creation the workspace has made, across all
// campaigns: generated images AND finished videos (the branded compositor
// exports + raw clips). Assets the user already paid to create, kept here as a
// reusable holding area + a list of completed projects. Excludes HD upscales and
// the intermediate video_segment parts of a stitched 30s render.
export const GET = withWorkspace(async (_req, { db }) => {
  const { data } = await db
    .from("assets")
    .select("id, url, type, campaign_id, metadata, created_at")
    .in("type", ["image", "composed_image", "composed_video", "video"])
    .order("created_at", { ascending: false })
    .limit(300);

  const assets = (data ?? []).filter(
    (a) => !(a.metadata as { hd?: boolean } | null)?.hd,
  );
  return NextResponse.json({ assets });
});
