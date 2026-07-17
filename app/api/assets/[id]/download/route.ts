import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getEntitlements } from "@/lib/billing/entitlements";
import { ensureWatermarked } from "@/lib/composition/watermark";
import { isVideoAsset } from "@/lib/util/asset-kind";

// GET /api/assets/:id/download — resolve the URL to save for this asset.
//
// Free tiers get the "built with tenfold" derivative; paid tiers get the source
// untouched. Never a 403: the workspace paid credits for this asset and is
// entitled to it. Withholding the file would be hostage-taking; stamping it is
// tiering — and a blocked user just screenshots it, so we'd take the complaint
// without gaining the protection.
//
// This closes the CONVENIENT bypass (the Download button), not every bypass:
// the assets bucket is public by design, so a determined user can still read
// the source URL off the preview. Making it airtight would mean private buckets
// + signed previews, which collides with the public-URL requirement Ayrshare
// has (CLAUDE.md §8). The mark is a nudge, not DRM.
export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, session, params }) => {
    const { data: asset } = await db
      .from("assets")
      .select("id, url, type")
      .eq("id", params.id)
      .maybeSingle();
    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const a = asset as { id: string; url: string; type: string };
    const ent = await getEntitlements(session.workspaceId);
    if (ent.watermarkFree) return NextResponse.json({ url: a.url });

    const out = await ensureWatermarked(
      a,
      session.workspaceId,
      isVideoAsset(a),
    );
    // A stamping failure falls back to the source URL, so compare urls rather
    // than assuming: the client shouldn't claim a mark that isn't there.
    return NextResponse.json({ url: out.url, watermarked: out.url !== a.url });
  },
);
