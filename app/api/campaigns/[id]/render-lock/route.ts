import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

/**
 * GET /api/campaigns/:id/render-lock — what the PICKED publish file was made
 * from. The Publish page compares `docSig` with the stage's own fingerprint
 * (lib/composition/signature.ts) to say "locked" (this render is the ad on the
 * stage) or "out of date" (the stage has moved on since). Tiny on purpose: it
 * selects one JSON key rather than shipping the render's whole recipe.
 *
 * `docSig` is null for a render made before fingerprints existed, or for a raw
 * clip — both read as "needs rendering", which is the safe answer.
 */
export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { data: campaign } = await db
      .from("campaigns")
      .select("id, publish_asset_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }
    const pickedId =
      (campaign as { publish_asset_id: string | null }).publish_asset_id ??
      null;
    if (!pickedId) {
      return NextResponse.json({
        pickedAssetId: null,
        type: null,
        docSig: null,
      });
    }
    const { data: asset } = await db
      .from("assets")
      .select("type, docSig:metadata->>docSig")
      .eq("id", pickedId)
      .maybeSingle();
    const a = asset as { type: string; docSig: string | null } | null;
    return NextResponse.json({
      pickedAssetId: pickedId,
      type: a?.type ?? null,
      docSig: a?.docSig ?? null,
    });
  },
  { rateLimit: false },
);
