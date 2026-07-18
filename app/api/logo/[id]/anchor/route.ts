import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";

// PATCH /api/logo/:id/anchor — pick a concept as the anchor (the campaign
// anchor-selection UX, reused). Free — no generation, no credit.
const bodySchema = z.object({ anchorAssetId: z.string().uuid() });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();

    // The asset must belong to this workspace AND this project — otherwise a
    // caller could anchor another workspace's asset onto their project.
    const { data: asset } = await admin
      .from("assets")
      .select("id")
      .eq("id", parsed.data.anchorAssetId)
      .eq("workspace_id", session.workspaceId)
      .eq("metadata->>logo_project_id", id)
      .maybeSingle();
    if (!asset) {
      return NextResponse.json(
        { error: "Asset not in this project" },
        { status: 400 },
      );
    }

    const { data: updated } = await admin
      .from("logo_projects")
      .update({
        anchor_asset_id: parsed.data.anchorAssetId,
        status: "refining",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .select("id, anchor_asset_id, status")
      .maybeSingle();
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ project: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
