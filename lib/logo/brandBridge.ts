import sharp from "sharp";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recolor, setBackground, extractFills, backgroundFill } from "./svg";

// Phase 4 — the moat. Adopt a finalized logo as the workspace brand mark by
// writing it into brand_kits.logo_url / logo_dark_url, which the compositor's
// end-card (Step4Compose → pickKitLogo, screen blend) already consumes. From
// then on every video/image the marketing pipeline produces auto-stamps the
// logo the user just designed.
//
// The end-card uses SCREEN blend on dark footage, so the primary mark
// (logo_url) is WHITE on transparent (screen → glows); the dark variant
// (logo_dark_url, for light backgrounds) is BLACK on transparent.

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Collapse every foreground fill to one colour. */
function monochrome(svg: string, rgb: string): string {
  const bg = backgroundFill(svg);
  const fg = extractFills(svg).filter((f) => f.value !== bg);
  return recolor(svg, Object.fromEntries(fg.map((f) => [f.value, rgb])));
}

async function rasterizeTransparent(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(setBackground(svg, "transparent"), "utf8"), {
    density: 384,
  })
    .resize(1024, 1024, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export interface BrandLogoUrls {
  logo_url: string;
  logo_dark_url: string;
}

/**
 * Rasterize the finalized SVG into white + black transparent marks, store them
 * at the brand-kit logo paths (upsert-overwriting any prior brand logo), and
 * point brand_kits at them. Returns the two public URLs.
 */
export async function applyLogoToBrandKit(
  admin: Admin,
  workspaceId: string,
  svg: string,
): Promise<BrandLogoUrls> {
  const whitePng = await rasterizeTransparent(
    monochrome(svg, "rgb(255,255,255)"),
  );
  const blackPng = await rasterizeTransparent(monochrome(svg, "rgb(0,0,0)"));

  const lightPath = `brand-kits/${workspaceId}/logo.png`;
  const darkPath = `brand-kits/${workspaceId}/logo-dark.png`;
  await Promise.all([
    admin.storage
      .from("assets")
      .upload(lightPath, whitePng, { contentType: "image/png", upsert: true }),
    admin.storage
      .from("assets")
      .upload(darkPath, blackPng, { contentType: "image/png", upsert: true }),
  ]);

  const logo_url = admin.storage.from("assets").getPublicUrl(lightPath)
    .data.publicUrl;
  const logo_dark_url = admin.storage.from("assets").getPublicUrl(darkPath)
    .data.publicUrl;

  await admin.from("brand_kits").upsert(
    {
      workspace_id: workspaceId,
      logo_url,
      logo_storage_path: lightPath,
      logo_dark_url,
      logo_dark_storage_path: darkPath,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );

  return { logo_url, logo_dark_url };
}
