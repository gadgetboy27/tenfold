import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

/**
 * DELETE /api/assets/:id — throw away one generated asset for good.
 *
 * Generation is cheap to repeat and every attempt was kept, so a campaign that
 * got iterated on ends up holding a dozen near-identical clips and a wall of
 * music takes ("Stellar Launch": 10 videos, 14 audio). Nothing could remove
 * one, and every consumer picked by "newest wins" — so the pile wasn't just
 * clutter, it decided what published.
 *
 * Removes the Storage object and the row. Two things are refused rather than
 * silently allowed:
 *
 *  - **The anchor image.** Everything downstream (video, compositor, publish)
 *    is derived from it; deleting it strands the campaign with no way back.
 *  - **Anything already published.** Reddit and Pinterest posts point at the
 *    public Storage URL rather than uploading a copy (see CLAUDE.md §7d), so
 *    deleting a published asset breaks a live post on someone else's site.
 *
 * The campaign's `publish_asset_id` clears itself via ON DELETE SET NULL
 * (migration 0032) — deleting the picked video un-picks it, it does not
 * cascade into the campaign.
 */
export const DELETE = withWorkspace<{ id: string }>(
  async (_req, { db, admin, session, params }) => {
    const { data: asset } = await db
      .from("assets")
      .select("id, campaign_id, type, storage_path")
      .eq("id", params.id)
      .maybeSingle();

    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    const a = asset as {
      id: string;
      campaign_id: string;
      type: string;
      storage_path: string | null;
    };

    const { data: campaign } = await db
      .from("campaigns")
      .select("id, anchor_asset_id")
      .eq("id", a.campaign_id)
      .maybeSingle();

    if (
      (campaign as { anchor_asset_id: string | null } | null)
        ?.anchor_asset_id === a.id
    ) {
      return NextResponse.json(
        {
          error:
            "This is the campaign's anchor image — the video, compositor and publish steps all build on it. Pick a different anchor first.",
        },
        { status: 409 },
      );
    }

    // Published? Walk asset → composition → publish_record. Both hops are
    // scoped to the workspace; a composition that merely references the asset
    // is fine, it's a SENT post that pins it.
    const { data: comps } = await db
      .from("compositions")
      .select("id")
      .or(`output_asset_id.eq.${a.id},anchor_asset_id.eq.${a.id}`);
    const compIds = (comps ?? []).map((c) => (c as { id: string }).id);
    if (compIds.length > 0) {
      const { data: published } = await db
        .from("publish_records")
        .select("id")
        .in("composition_id", compIds)
        .not("published_at", "is", null)
        .limit(1);
      if ((published ?? []).length > 0) {
        return NextResponse.json(
          {
            error:
              "This one has already been published — some networks link straight to the file, so deleting it would break the live post.",
          },
          { status: 409 },
        );
      }
    }

    // Storage first, best-effort: an object that's already gone must not leave
    // the row behind, or the asset stays listed forever and undeletable.
    if (a.storage_path) {
      await admin.storage
        .from("assets")
        .remove([a.storage_path])
        .catch(() => undefined);
    }

    const { error } = await db.from("assets").delete().eq("id", a.id);
    if (error) throw new Error(error.message);

    // Report the pick back so the caller knows whether the campaign just lost
    // the video it was going to publish.
    const { data: after } = await db
      .from("campaigns")
      .select("publish_asset_id")
      .eq("id", a.campaign_id)
      .maybeSingle();

    return NextResponse.json({
      deleted: true,
      id: a.id,
      type: a.type,
      publishAssetId:
        (after as { publish_asset_id: string | null } | null)
          ?.publish_asset_id ?? null,
      workspaceId: session.workspaceId,
    });
  },
);
