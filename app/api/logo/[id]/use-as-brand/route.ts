import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { isEnabled } from "@/lib/flags";
import { applyLogoToBrandKit } from "@/lib/logo/brandBridge";

// POST /api/logo/:id/use-as-brand — adopt the finalized logo as the workspace
// brand mark (writes brand_kits.logo_url/logo_dark_url). FREE: pure raster, no
// AI. After this, every campaign's Compose step auto-stamps this logo.
export const POST = withWorkspace<{ id: string }>(
  async (_req, { db, admin, session, params }) => {
    if (!isEnabled("logoBuilder")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { id } = params;

    const { data: project } = await db
      .from("logo_projects")
      .select("id, final_asset_id")
      .eq("id", id)
      .maybeSingle();
    const finalId = (project as { final_asset_id: string | null } | null)
      ?.final_asset_id;
    if (!project || !finalId) {
      return NextResponse.json(
        { error: "Finalise your logo first" },
        { status: 400 },
      );
    }

    const { data: asset } = await db
      .from("assets")
      .select("url")
      .eq("id", finalId)
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

    const urls = await applyLogoToBrandKit(admin, session.workspaceId, svg);
    return NextResponse.json({ ...urls }, { status: 200 });
  },
);
