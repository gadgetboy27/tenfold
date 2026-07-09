import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { compositionDocSchema } from "@/lib/composition/layers";
import { renderComposition } from "@/lib/composition/export";

// POST /api/compositions/export — headless FFmpeg render of a layered
// composition to MP4. Free (composes assets the workspace already owns).
// The doc is sent inline so both saved compositions and the compositor lab
// can export; when campaignId is present the MP4 is persisted as an asset.

const bodySchema = z.object({
  doc: compositionDocSchema,
  campaignId: z.string().uuid().nullable().optional(),
  compositionId: z.string().uuid().nullable().optional(),
  audioUrl: z.string().url().nullable().optional(),
});

const isHttp = (u: string) => /^https?:\/\//i.test(u);

export const POST = withWorkspace(async (req, { admin, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid export request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { doc, campaignId, compositionId, audioUrl } = parsed.data;

  // Every source must be fetchable by the server — a blob: URL only ever
  // existed in the user's browser tab.
  const srcs = [
    doc.background.src,
    ...doc.layers.flatMap((l) => (l.kind === "image" ? [l.src] : [])),
    ...(audioUrl ? [audioUrl] : []),
  ];
  if (!srcs.every(isHttp)) {
    return NextResponse.json(
      { error: "All layer sources must be uploaded before export." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await renderComposition({
      doc,
      workspaceId: session.workspaceId,
      campaignId: campaignId ?? null,
      audioUrl: audioUrl ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Persist as an asset when it belongs to a campaign; update the saved
  // composition row when one exists.
  let assetId: string | null = null;
  if (campaignId) {
    assetId = uuidv4();
    await admin.from("assets").insert({
      id: assetId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "composed_video",
      url: result.url,
      storage_path: result.storagePath,
    });
  }
  if (compositionId) {
    await admin
      .from("compositions")
      .update({
        output_asset_id: assetId,
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", compositionId)
      .eq("workspace_id", session.workspaceId);
  }

  return NextResponse.json(
    { url: result.url, assetId, durationSec: result.durationSec, free: true },
    { status: 201 },
  );
});
