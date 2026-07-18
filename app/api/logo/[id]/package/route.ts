import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import JSZip from "jszip";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { ensureLogoCampaign } from "@/app/api/logo/route";
import { assembleBrandPackage } from "@/lib/logo/assemble";
import { applyLogoToBrandKit } from "@/lib/logo/brandBridge";
import { logoBriefSchema } from "@/lib/logo/brief";

// POST /api/logo/:id/package — the brand package. Debit brand_package (10cr),
// rasterize the finalized SVG into every deliverable, zip it, store it, and
// write the extracted palette into the workspace brand kit. Synchronous (Sharp,
// no fal) — the work is CPU-bound and finishes inside the request.
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
    const admin = createSupabaseAdminClient();

    const { data: project } = await admin
      .from("logo_projects")
      .select("id, final_asset_id, brief")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    const finalId = (project as { final_asset_id: string | null } | null)
      ?.final_asset_id;
    if (!project || !finalId) {
      return NextResponse.json(
        { error: "Finalise your logo before packaging" },
        { status: 400 },
      );
    }

    const { data: asset } = await admin
      .from("assets")
      .select("url")
      .eq("id", finalId)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    const svgUrl = (asset as { url: string } | null)?.url;
    if (!svgUrl) {
      return NextResponse.json(
        { error: "Final logo missing" },
        { status: 400 },
      );
    }
    const svg = await (await fetch(svgUrl)).text();
    if (!svg.includes("<svg")) {
      return NextResponse.json(
        { error: "Final logo is not SVG" },
        { status: 400 },
      );
    }

    const jobId = uuidv4();
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "brand_package",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    try {
      // Build every deliverable + the AI extras (font pairing, guideline PDF).
      const brief = logoBriefSchema.parse(
        (project as { brief: unknown }).brief ?? {},
      );
      const { files, palette, fonts } = await assembleBrandPackage({
        svg,
        brief,
      });
      const zip = new JSZip();
      for (const f of files) zip.file(f.path, f.buffer);
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const campaignId = await ensureLogoCampaign(
        admin,
        session.workspaceId,
        session.userId,
      );
      const bundleId = uuidv4();
      const storagePath = `${session.workspaceId}/${campaignId}/${bundleId}.zip`;
      const { error: upErr } = await admin.storage
        .from("assets")
        .upload(storagePath, zipBuffer, { contentType: "application/zip" });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = admin.storage
        .from("assets")
        .getPublicUrl(storagePath);

      await admin.from("assets").insert({
        id: bundleId,
        campaign_id: campaignId,
        workspace_id: session.workspaceId,
        type: "image",
        url: urlData.publicUrl,
        storage_path: storagePath,
        metadata: {
          kind: "logo_bundle",
          logo_project_id: id,
          logo_stage: "brand_package",
          file_count: files.length,
        },
      });

      // Write the logo's palette + recommended heading font into the brand kit.
      if (palette.length > 0 || fonts) {
        await admin.from("brand_kits").upsert(
          {
            workspace_id: session.workspaceId,
            ...(palette[0] ? { primary_color: palette[0] } : {}),
            ...(palette[1] ? { secondary_color: palette[1] } : {}),
            ...(palette[2] ? { accent_color: palette[2] } : {}),
            ...(fonts ? { font_family: fonts.heading } : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id" },
        );
      }

      // Adopt the logo as the workspace brand mark so it auto-stamps on every
      // campaign (Phase 4 bridge). Best-effort — the paid zip already shipped.
      try {
        await applyLogoToBrandKit(admin, session.workspaceId, svg);
      } catch {
        // Brand adoption failed; the package download is unaffected.
      }

      await admin
        .from("logo_projects")
        .update({ status: "packaged", updated_at: new Date().toISOString() })
        .eq("id", id);

      return NextResponse.json(
        {
          downloadUrl: urlData.publicUrl,
          fileCount: files.length,
          palette,
          fonts,
          creditCost: CREDIT_COSTS.brand_package,
        },
        { status: 201 },
      );
    } catch (err) {
      await refundCredits(jobId);
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
