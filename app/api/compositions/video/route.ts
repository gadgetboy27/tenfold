import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { composeVideoSchema } from "@/lib/validation/schemas";
import { getEntitlements } from "@/lib/billing/entitlements";
import { composeVideo, CAPTION_PRESETS } from "@/lib/composition/video";

// POST /api/compositions/video — layer existing assets (campaign video + music
// + caption) into one MP4 via FFmpeg. Composes assets already owned, so it
// NEVER charges credits and is fully reversible (re-render with new layers).
export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const body = composeVideoSchema.parse(await req.json());

  // Pro-gate the more elaborate caption styles.
  const preset = CAPTION_PRESETS.find((p) => p.id === body.captionStyle);
  if (preset?.proOnly) {
    const ent = await getEntitlements(session.workspaceId);
    if (!ent.isPro) {
      return NextResponse.json(
        {
          error: `The "${preset.label}" caption style is a Pro feature.`,
          upgrade: true,
        },
        { status: 403 },
      );
    }
  }

  // Base layer: the campaign's most recent video (an existing asset).
  const { data: videoAsset } = await db
    .from("assets")
    .select("id, url")
    .eq("campaign_id", body.campaignId)
    .eq("type", "video")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const video = videoAsset as { id: string; url: string } | null;
  if (!video) {
    return NextResponse.json(
      { error: "Generate a video first — there's nothing to compose yet." },
      { status: 400 },
    );
  }

  // Music layer (optional, existing asset).
  let audioUrl: string | null = null;
  if (body.useMusic) {
    const { data: audioAsset } = await db
      .from("assets")
      .select("url")
      .eq("campaign_id", body.campaignId)
      .eq("type", "audio")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    audioUrl = (audioAsset as { url: string } | null)?.url ?? null;
  }

  let result;
  try {
    result = await composeVideo({
      videoUrl: video.url,
      audioUrl,
      caption: body.caption,
      captionStyle: body.captionStyle,
      logoUrl: body.logoUrl ?? null,
      workspaceId: session.workspaceId,
      campaignId: body.campaignId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Composition failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Persist the rendered MP4 as a new asset + a composition record. Source
  // assets are untouched, so the user can re-render with different layers.
  const assetId = uuidv4();
  await admin.from("assets").insert({
    id: assetId,
    campaign_id: body.campaignId,
    workspace_id: session.workspaceId,
    type: "composed_video",
    url: result.url,
    storage_path: result.storagePath,
  });

  const compositionId = uuidv4();
  await admin.from("compositions").insert({
    id: compositionId,
    campaign_id: body.campaignId,
    workspace_id: session.workspaceId,
    anchor_asset_id: video.id,
    output_asset_id: assetId,
    format: "reel",
    caption: body.caption ?? null,
    text_overlays: [],
    branding: {
      captionStyle: body.captionStyle,
      useMusic: body.useMusic,
      logoUrl: body.logoUrl ?? null,
    },
    status: "ready",
  });

  return NextResponse.json(
    { url: result.url, assetId, compositionId, free: true },
    { status: 201 },
  );
});
