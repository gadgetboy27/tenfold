import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { renderImageCardVideo } from "@/lib/composition/image-card";

// POST /api/compositions/card — bake the static image onto the video as an
// intro or outro card, save the merged clip as the campaign's newest
// composed_video (so publish picks it up), and return its URL. Free — it just
// composes assets the workspace already owns.

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  videoUrl: z.string().url(),
  imageUrl: z.string().url(),
  position: z.enum(["intro", "outro"]),
  durationSec: z.number().min(1).max(6).optional(),
});

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid card request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { campaignId, videoUrl, imageUrl, position, durationSec } = parsed.data;

  // Campaign must belong to this workspace (tenant isolation).
  const { data: campaign } = await db
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let result;
  try {
    result = await renderImageCardVideo({
      videoUrl,
      imageUrl,
      position,
      durationSec,
      workspaceId: session.workspaceId,
      campaignId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Card render failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const assetId = uuidv4();
  const { error } = await admin.from("assets").insert({
    id: assetId,
    campaign_id: campaignId,
    workspace_id: session.workspaceId,
    type: "composed_video",
    url: result.url,
    storage_path: result.storagePath,
    metadata: { card: position },
  });
  if (error) {
    return NextResponse.json(
      { error: `Failed to save merged video: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: result.url, assetId, free: true });
});
