import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

/**
 * GET /api/campaigns/:id/progress — everything a project has produced so far,
 * in one shot: which steps are done, and the assets themselves.
 *
 * Two jobs, one query set, because they answer the same question at different
 * zoom levels:
 *
 *  - `done` drives Studio's nav ticks, so a user can see at a glance what
 *    they've already started under this project name. Studio's own local state
 *    only ever knew about the section it was sitting on — the four Pro tools
 *    and the Compositor/Publish steps hardcoded `done: false`, and reopening a
 *    project lost the rest entirely.
 *  - `bundle` is that same work as a list, for the "see it all together" strip
 *    on the Compositor and Publish screens.
 *
 * Note on `logo`: logo projects are workspace-level (they hang off the shared
 * "Logos" holding campaign, see app/api/logo/route.ts), not per-campaign — so
 * this flag means "this workspace has a finished mark", not "this project made
 * one". That's the honest reading of the data, and still the useful one.
 */

interface AssetRow {
  id: string;
  url: string;
  type: string;
  metadata: { hd?: boolean; kind?: string } | null;
  created_at: string;
}

export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, admin, session, params }) => {
    const { data: campaign } = await db
      .from("campaigns")
      .select("id, name, anchor_asset_id, expansion_data, approval_status")
      .eq("id", params.id)
      .maybeSingle();
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const camp = campaign as {
      id: string;
      name: string | null;
      anchor_asset_id: string | null;
      expansion_data: { script?: { content?: string } } | null;
      approval_status: string | null;
    };

    const [{ data: assetRows }, { data: jobRows }, { data: compositionRows }] =
      await Promise.all([
        db
          .from("assets")
          .select("id, url, type, metadata, created_at")
          .eq("campaign_id", params.id)
          .order("created_at", { ascending: false }),
        db
          .from("creative_jobs")
          .select("type, status")
          .eq("campaign_id", params.id),
        db.from("compositions").select("id").eq("campaign_id", params.id),
      ]);

    const assets = (assetRows ?? []) as AssetRow[];
    const compositionIds = (compositionRows ?? []).map(
      (c) => (c as { id: string }).id,
    );

    // publish_records hangs off compositions, not campaigns — same indirection
    // the Gallery's own badges use in app/api/campaigns/route.ts.
    let isPublished = false;
    if (compositionIds.length > 0) {
      const { data: publishRows } = await db
        .from("publish_records")
        .select("id")
        .in("composition_id", compositionIds)
        .in("status", ["published", "scheduled"])
        .limit(1);
      isPublished = (publishRows ?? []).length > 0;
    }

    // A completed job of a given type is what "this tool has been used" means
    // for the four Pro panels — their outputs land as plain image/video assets
    // with no marker of which tool made them.
    const completedTypes = new Set(
      (jobRows ?? [])
        .filter((j) => (j as { status: string }).status === "completed")
        .map((j) => (j as { type: string }).type),
    );

    // Workspace-level, not campaign-level — see the note above. Uses the raw
    // client since logo_projects isn't in WORKSPACE_SCOPED_TABLES; the
    // workspace filter is applied explicitly.
    const { data: logoRows } = await admin
      .from("logo_projects")
      .select("id")
      .eq("workspace_id", session.workspaceId)
      .not("final_asset_id", "is", null)
      .limit(1);

    const images = assets.filter(
      (a) =>
        (a.type === "image" || a.type === "composed_image") && !a.metadata?.hd,
    );
    const videos = assets.filter(
      (a) => a.type === "video" || a.type === "composed_video",
    );
    const audio = assets.filter((a) => a.type === "audio");
    const caption = camp.expansion_data?.script?.content?.trim() ?? "";

    return NextResponse.json({
      campaignId: camp.id,
      campaignName: camp.name,
      approvalStatus: camp.approval_status,
      // Keyed by Studio's SectionId so the nav can read it directly.
      done: {
        images: !!camp.anchor_asset_id,
        productshot: completedTypes.has("product_shot"),
        tryon: completedTypes.has("virtual_tryon"),
        video: videos.length > 0,
        talking: completedTypes.has("talking_video"),
        autocaption: completedTypes.has("auto_caption"),
        music: audio.length > 0,
        caption: caption.length > 0,
        compositor: compositionIds.length > 0,
        logo: (logoRows ?? []).length > 0,
        publish: isPublished,
      },
      bundle: {
        images: images.map(({ id, url, created_at }) => ({
          id,
          url,
          createdAt: created_at,
        })),
        videos: videos.map(({ id, url, type, created_at }) => ({
          id,
          url,
          // A composed_video is the branded export; `video` is the raw clip.
          branded: type === "composed_video",
          createdAt: created_at,
        })),
        audio: audio.map(({ id, url, created_at }) => ({
          id,
          url,
          createdAt: created_at,
        })),
        caption,
        anchorId: camp.anchor_asset_id,
        compositionCount: compositionIds.length,
      },
    });
  },
);
