import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import {
  overlayProposalSchema,
  overlayAsTreatment,
  withUserWording,
} from "@/lib/composition/ad-notes";
import { buildWordsLayer } from "@/lib/composition/words";
import { renderComposition } from "@/lib/composition/export";
import { displayVideo } from "@/lib/campaign/video-pick";
import { probeDurationSec } from "@/lib/composition/frames";

/**
 * POST /api/ad-watch/apply — put accepted review overlays onto the video.
 *
 * Re-exports the clip with the overlays burnt in and stores the result as a
 * NEW composed_video, then parks the campaign at pending_review. Nothing here
 * publishes: the existing approval gate in POST /api/publish is what decides
 * whether it can go out, and this deliberately routes through it rather than
 * around it — an automated change to an advert is exactly what that gate is
 * for.
 *
 * FREE, unlike the review itself. This is FFmpeg and storage, no model call —
 * the judgement was paid for once when the notes were produced, and charging
 * again to act on them would tax the half of the feature that actually
 * changes anything.
 */
const bodySchema = z.object({
  campaignId: z.string().uuid(),
  assetId: z.string().uuid().nullish(),
  /** The overlays to burn in, with any wording the user edited. */
  overlays: z
    .array(
      z.object({
        proposal: overlayProposalSchema,
        /** User's replacement wording; empty keeps the model's. */
        text: z.string().max(120).nullish(),
      }),
    )
    .min(1)
    .max(4),
});

interface ClipRow {
  id: string;
  url: string;
  type: string;
  created_at: string;
  metadata: { aspect?: string } | null;
}

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { campaignId, assetId, overlays } = parsed.data;

  const { data: campaign } = await db
    .from("campaigns")
    .select("id, publish_asset_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: clipRows } = await db
    .from("assets")
    .select("id, url, type, created_at, metadata")
    .eq("campaign_id", campaignId)
    .in("type", ["video", "composed_video"])
    .order("created_at", { ascending: false });
  const clips = ((clipRows ?? []) as ClipRow[]).map((r) => ({
    ...r,
    createdAt: r.created_at,
  }));

  // Same resolution as the review itself, so what gets fixed is what got
  // reviewed — and what would publish.
  const pickedId =
    (campaign as { publish_asset_id: string | null }).publish_asset_id ?? null;
  const source = assetId
    ? (clips.find((c) => c.id === assetId) ?? null)
    : displayVideo(clips, pickedId);
  if (!source) {
    return NextResponse.json(
      { error: "No video to apply these to." },
      { status: 404 },
    );
  }

  const aspect = (source.metadata?.aspect ?? "16:9") as "9:16" | "1:1" | "16:9";

  try {
    // Duration matters: the layer envelope and the virtual clock both read it,
    // and a wrong value puts overlays on screen for the wrong span.
    const durationSec = (await probeDurationSec(source.url)) ?? undefined;

    const layers = overlays.map((o, i) =>
      buildWordsLayer({
        id: `review-${i}-${uuidv4().slice(0, 8)}`,
        text: withUserWording(o.proposal, o.text).text,
        treatment: overlayAsTreatment(o.proposal),
        aspect,
      }),
    );

    const { url, storagePath } = await renderComposition({
      doc: {
        id: uuidv4(),
        aspect,
        // The clip is the BACKDROP — the layer union is image|text, so there
        // is no video layer (components/studio/CLAUDE.md).
        background: { kind: "video", src: source.url, durationSec },
        layers,
      },
      workspaceId: session.workspaceId,
      campaignId,
    });

    const newId = uuidv4();
    const { error: insErr } = await admin.from("assets").insert({
      id: newId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "composed_video",
      url,
      storage_path: storagePath,
      // Carry the aspect tag or the publish fan-out stops matching formats.
      metadata: source.metadata ?? null,
    });
    if (insErr) throw new Error(insErr.message);

    // Point the campaign at the new cut and send it for review. Both together:
    // making it the publish target without requiring approval would let an
    // automated edit go out unseen, and requiring approval without pointing at
    // it would approve the OLD video.
    await admin
      .from("campaigns")
      .update({ publish_asset_id: newId, approval_status: "pending_review" })
      .eq("id", campaignId)
      .eq("workspace_id", session.workspaceId);

    return NextResponse.json({
      assetId: newId,
      url,
      applied: layers.length,
      approvalStatus: "pending_review",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't apply the overlays";
    // 422, not 5xx: Cloudflare replaces origin 5xx with its own error page and
    // the real reason never reaches the client.
    return NextResponse.json({ error: message }, { status: 422 });
  }
});
