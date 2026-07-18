import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { ensureLogoCampaign } from "@/app/api/logo/route";

// POST /api/logo/:id/save-edit — persist a client-side edit (recolour /
// background) as a NEW asset version. FREE: no fal call, no credit — the editor
// mutated SVG XML in the browser; this only stores the result.
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const bodySchema = z.object({
  svg: z.string().min(1).max(MAX_SVG_BYTES),
  label: z.string().trim().max(60).optional(),
});

// Strip active content before storing SVG that will be served from the assets
// bucket. The editor never introduces scripts, but defence-in-depth: an SVG can
// carry <script> or on* handlers, so remove them regardless of source.
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const svg = sanitizeSvg(parsed.data.svg);
    if (!svg.includes("<svg")) {
      return NextResponse.json({ error: "Not an SVG" }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();

    const { data: project } = await admin
      .from("logo_projects")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const campaignId = await ensureLogoCampaign(
      admin,
      session.workspaceId,
      session.userId,
    );

    const assetId = uuidv4();
    const storagePath = `${session.workspaceId}/${campaignId}/${assetId}.svg`;
    const { error: upErr } = await admin.storage
      .from("assets")
      .upload(storagePath, Buffer.from(svg, "utf8"), {
        contentType: "image/svg+xml",
      });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    const { data: urlData } = admin.storage
      .from("assets")
      .getPublicUrl(storagePath);

    const { error: insErr } = await admin.from("assets").insert({
      id: assetId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "image",
      url: urlData.publicUrl,
      storage_path: storagePath,
      metadata: {
        kind: "logo_svg",
        logo_project_id: id,
        logo_stage: "logo_edit",
        label: parsed.data.label ?? "Edited",
      },
    });
    if (insErr) {
      throw new Error(insErr.message);
    }

    return NextResponse.json(
      { asset: { id: assetId, url: urlData.publicUrl } },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
