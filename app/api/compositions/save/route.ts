import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import {
  ASPECT_TO_FORMAT,
  compositionDocSchema,
} from "@/lib/composition/layers";

// POST /api/compositions/save — persist the editable composition doc WITHOUT
// rendering, so in-progress work survives leaving the compositor. Autosaved by
// the compositor as the user edits. Upserts the campaign's single composition
// row (the same one export reuses), so it reloads on reopen via the campaign's
// latestCompositionId. No credits, no FFmpeg — just a state write.
const bodySchema = z.object({
  doc: compositionDocSchema,
  campaignId: z.string().uuid(),
});

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid save request" },
      { status: 400 },
    );
  }
  const { doc, campaignId } = parsed.data;

  // Tenant check via the workspace-scoped client before writing.
  const { data: campaign } = await db
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const row = {
    format: ASPECT_TO_FORMAT[doc.aspect],
    background: doc.background,
    layers: doc.layers,
    overrides: doc.overrides ?? {},
    updated_at: new Date().toISOString(),
  };

  // Reuse the campaign's latest composition row (export uses the same one), so
  // there's a single source of truth per campaign rather than a new row each save.
  const { data: existing } = await admin
    .from("compositions")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("workspace_id", session.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const targetId = (existing as { id: string } | null)?.id ?? null;

  if (targetId) {
    const { error } = await admin
      .from("compositions")
      .update(row)
      .eq("id", targetId)
      .eq("workspace_id", session.workspaceId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ compositionId: targetId });
  }

  const newId = uuidv4();
  const { error } = await admin.from("compositions").insert({
    id: newId,
    campaign_id: campaignId,
    workspace_id: session.workspaceId,
    anchor_asset_id: null,
    status: "draft",
    ...row,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ compositionId: newId });
});
