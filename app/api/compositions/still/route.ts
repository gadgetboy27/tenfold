import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import {
  ASPECT_DESIGN,
  type CompositionAspect,
} from "@/lib/composition/layers";
import { assertRasterMatches } from "@/lib/uploads/content";

// POST /api/compositions/still — store a flattened photo of the composed ad
// (background + every overlay, drawn in the browser by the same renderer the
// stage uses) as a campaign asset, so a photo post can publish the ad the user
// SEES instead of the bare anchor image. Free — it stores pixels the user
// already made. JPEG only: Instagram's Graph API refuses anything else.

const MAX_BYTES = 12 * 1024 * 1024;
const fields = z.object({
  campaignId: z.string().uuid(),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
});

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const form = await req.formData();
  const file = form.get("file");
  const parsed = fields.safeParse({
    campaignId: form.get("campaignId"),
    aspect: form.get("aspect"),
  });
  if (!(file instanceof File) || !parsed.success) {
    return NextResponse.json(
      { error: "Invalid still request" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 400 });
  }
  const { campaignId, aspect } = parsed.data;

  // Campaign must belong to this workspace (tenant isolation).
  const { data: campaign } = await db
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const buffer = await file.arrayBuffer();
  try {
    await assertRasterMatches(buffer, "jpg");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unreadable image" },
      { status: 400 },
    );
  }

  const storagePath = `composed/${session.workspaceId}/${campaignId}/${uuidv4()}.jpg`;
  const { error: upErr } = await admin.storage
    .from("assets")
    .upload(storagePath, buffer, { contentType: "image/jpeg" });
  if (upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  const url = admin.storage.from("assets").getPublicUrl(storagePath)
    .data.publicUrl;

  const design = ASPECT_DESIGN[aspect as CompositionAspect];
  const assetId = uuidv4();
  const { error } = await admin.from("assets").insert({
    id: assetId,
    campaign_id: campaignId,
    workspace_id: session.workspaceId,
    type: "composed_image",
    url,
    storage_path: storagePath,
    width_px: design.width,
    height_px: design.height,
    file_size_bytes: file.size,
    metadata: { aspect, composed: true },
  });
  if (error) {
    return NextResponse.json(
      { error: `Failed to save the image: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ assetId, url, free: true }, { status: 201 });
});
