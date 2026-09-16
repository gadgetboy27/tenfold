import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { z } from "zod";
import { isEnabled } from "@/lib/flags";

// PATCH /api/logo/:id/anchor — pick a concept as the anchor (the campaign
// anchor-selection UX, reused). Free — no generation, no credit.
const bodySchema = z.object({ anchorAssetId: z.string().uuid() });

export const PATCH = withWorkspace<{ id: string }>(
  async (req, { db, params }) => {
    if (!isEnabled("logoBuilder")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { id } = params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // The asset must belong to this workspace AND this project — otherwise a
    // caller could anchor another workspace's asset onto their project.
    const { data: asset } = await db
      .from("assets")
      .select("id")
      .eq("id", parsed.data.anchorAssetId)
      .eq("metadata->>logo_project_id", id)
      .maybeSingle();
    if (!asset) {
      return NextResponse.json(
        { error: "Asset not in this project" },
        { status: 400 },
      );
    }

    const { data: updated } = await db
      .from("logo_projects")
      .update({
        anchor_asset_id: parsed.data.anchorAssetId,
        status: "refining",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, anchor_asset_id, status")
      .maybeSingle();
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ project: updated });
  },
);
