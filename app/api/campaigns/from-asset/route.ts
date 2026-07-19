import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { randomCampaignName } from "@/lib/util/campaign-name";
import { z } from "zod";

const schema = z.object({ assetId: z.string().uuid() });

// POST /api/campaigns/from-asset — start a NEW campaign using an existing
// (already-paid-for) gallery image as its anchor. No generation, no credits.
// Copies the asset into the new campaign so it's properly scoped, and sets it
// as the anchor; the client then opens the campaign at the expand step.
export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const { assetId } = schema.parse(await req.json());

  const { data: src } = await db
    .from("assets")
    .select("id, url, storage_path, job_id, metadata, campaign_id")
    .eq("id", assetId)
    .single();

  const source = src as {
    url: string;
    storage_path: string | null;
    job_id: string | null;
    metadata: Record<string, unknown> | null;
    campaign_id: string;
  } | null;
  if (!source) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // A logo is a brand element, not campaign content — starting a campaign from
  // it would turn the mark into a video with music and a script. Refuse it and
  // point to where a logo actually belongs: the compositor, as a layer.
  const kind = (source.metadata?.kind as string | undefined) ?? "";
  if (kind.startsWith("logo")) {
    return NextResponse.json(
      {
        error:
          "That's a brand logo — add it to a video in the compositor (Add logo), not as a campaign on its own.",
      },
      { status: 400 },
    );
  }

  // Carry over the original prompt/style for context (best-effort).
  const { data: srcCampaign } = await db
    .from("campaigns")
    .select("prompt, parameters")
    .eq("id", source.campaign_id)
    .single();
  const sc = srcCampaign as {
    prompt: string | null;
    parameters: Record<string, unknown> | null;
  } | null;
  const prompt = (source.metadata?.prompt as string) ?? sc?.prompt ?? "";

  const campaignId = uuidv4();
  const newAssetId = uuidv4();
  const campaignName = randomCampaignName();

  const { error: campErr } = await admin.from("campaigns").insert({
    id: campaignId,
    workspace_id: session.workspaceId,
    created_by: session.userId,
    name: campaignName,
    prompt,
    parameters: sc?.parameters ?? {},
    status: "ready",
    anchor_asset_id: newAssetId,
  });
  if (campErr) throw new Error(campErr.message);

  const { error: assetErr } = await admin.from("assets").insert({
    id: newAssetId,
    campaign_id: campaignId,
    workspace_id: session.workspaceId,
    job_id: source.job_id,
    type: "image",
    url: source.url,
    storage_path: source.storage_path,
    metadata: {
      ...(source.metadata ?? {}),
      reused_from: assetId,
    },
  });
  if (assetErr) throw new Error(assetErr.message);

  const params = (sc?.parameters ?? {}) as {
    aspectRatio?: string;
    style?: string;
  };
  return NextResponse.json(
    {
      campaignId,
      campaignName,
      asset: {
        id: newAssetId,
        url: source.url,
        prompt,
        aspectRatio: params.aspectRatio ?? "1:1",
        style: params.style ?? "Photorealistic",
        direction: (source.metadata?.direction as string) ?? undefined,
        createdAt: new Date().toISOString(),
      },
    },
    { status: 201 },
  );
});
