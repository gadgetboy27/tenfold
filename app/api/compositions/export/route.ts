import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import {
  ASPECT_DESIGN,
  ASPECT_TO_FORMAT,
  compositionDocSchema,
  type CompositionAspect,
} from "@/lib/composition/layers";
import { renderComposition, renderFanOut } from "@/lib/composition/export";

// POST /api/compositions/export — headless FFmpeg render of a layered
// composition to MP4. Free (composes assets the workspace already owns).
// The doc is sent inline so both saved compositions and the compositor lab
// can export; when campaignId is present each render is persisted as an asset.
//
// Pass `aspects` to fan out: one MP4 per aspect (each with its per-format
// overrides), each asset tagged with its aspect so publish can post the right
// format to each platform. Omit `aspects` for a single render of doc.aspect.

const bodySchema = z.object({
  doc: compositionDocSchema,
  campaignId: z.string().uuid().nullable().optional(),
  compositionId: z.string().uuid().nullable().optional(),
  audioUrl: z.string().url().nullable().optional(),
  aspects: z
    .array(z.enum(["9:16", "1:1", "16:9"]))
    .min(1)
    .max(3)
    .optional(),
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
  const { doc, campaignId, compositionId, audioUrl, aspects } = parsed.data;

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

  // Persist one campaign asset per render, tagged with its aspect so the
  // publish step can select the matching format per platform.
  const saveAsset = async (
    aspect: CompositionAspect,
    url: string,
    storagePath: string,
  ): Promise<string | null> => {
    if (!campaignId) return null;
    const id = uuidv4();
    const { error } = await admin.from("assets").insert({
      id,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "composed_video",
      url,
      storage_path: storagePath,
      width_px: ASPECT_DESIGN[aspect].width,
      height_px: ASPECT_DESIGN[aspect].height,
      metadata: { aspect, format: ASPECT_TO_FORMAT[aspect] },
    });
    // Surface failures instead of returning an id for a row that doesn't exist
    // (this insert used to fail the job_id NOT NULL constraint silently).
    if (error)
      throw new Error(`Failed to save ${aspect} asset: ${error.message}`);
    return id;
  };

  const renderInput = {
    doc,
    workspaceId: session.workspaceId,
    campaignId: campaignId ?? null,
    audioUrl: audioUrl ?? null,
  };

  // ── Fan-out: one MP4 per requested aspect ──────────────────────────────────
  if (aspects && aspects.length > 0) {
    let results;
    try {
      results = await renderFanOut(renderInput, aspects);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    const outputs = [];
    for (const r of results) {
      const assetId = await saveAsset(r.aspect, r.url, r.storagePath);
      outputs.push({
        aspect: r.aspect,
        url: r.url,
        assetId,
        durationSec: r.durationSec,
      });
    }
    if (compositionId) {
      // Point the saved composition at the master aspect's output.
      const primary =
        outputs.find((o) => o.aspect === doc.aspect) ?? outputs[0];
      await admin
        .from("compositions")
        .update({
          output_asset_id: primary.assetId,
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", compositionId)
        .eq("workspace_id", session.workspaceId);
    }
    return NextResponse.json({ outputs, free: true }, { status: 201 });
  }

  // ── Single render (doc.aspect) ─────────────────────────────────────────────
  let result;
  try {
    result = await renderComposition(renderInput);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const assetId = await saveAsset(doc.aspect, result.url, result.storagePath);
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
