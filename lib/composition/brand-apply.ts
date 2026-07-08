import {
  ASPECT_DESIGN,
  type CompositionAspect,
  type Layer,
} from "@/lib/composition/layers";

/**
 * "Apply brand kit" — turn the saved kit into default compositor layers
 * (docs/tenfold-compositor-brief.md §4): the logo as an end-frame layer
 * (screen blend, fading in over the clip's final two seconds, holding to the
 * end) and the tagline as a caption text layer. Pure function: the caller
 * supplies the logo's natural pixel width (from the loaded image) so scale
 * can target a fraction of the frame.
 */

const BRAND_FONTS = [
  "Inter",
  "Montserrat",
  "Playfair Display",
  "Lora",
  "Roboto",
] as const;
type BrandFont = (typeof BRAND_FONTS)[number];

export interface BrandKitInfo {
  logo_url?: string | null;
  logo_dark_url?: string | null;
  tagline?: string | null;
  font_family?: string | null;
}

/** The light mark glows on dark footage (screen blend); fall back to dark. */
export function pickKitLogo(kit: BrandKitInfo): string | null {
  return kit.logo_url ?? kit.logo_dark_url ?? null;
}

export function brandKitLayers(
  kit: BrandKitInfo,
  aspect: CompositionAspect,
  clipDurationSec: number,
  logoNaturalWidth: number | null,
): Layer[] {
  const design = ASPECT_DESIGN[aspect];
  const layers: Layer[] = [];

  const tagline = kit.tagline?.trim();
  if (tagline) {
    const font: BrandFont = (BRAND_FONTS as readonly string[]).includes(
      kit.font_family ?? "",
    )
      ? (kit.font_family as BrandFont)
      : "Inter";
    layers.push({
      id: crypto.randomUUID(),
      kind: "text",
      text: tagline,
      font,
      sizePx: Math.round(design.width / 18),
      color: "#ffffff",
      x: design.width / 2,
      y: Math.round(design.height * 0.88),
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0.5,
    });
  }

  const logoSrc = pickKitLogo(kit);
  if (logoSrc) {
    // Target ~45% of frame width for the end-card mark.
    const scale = logoNaturalWidth
      ? (design.width * 0.45) / logoNaturalWidth
      : 0.5;
    layers.push({
      id: crypto.randomUUID(),
      kind: "image",
      src: logoSrc,
      x: design.width / 2,
      y: Math.round(design.height * 0.45),
      scale: Math.min(20, Math.max(0.01, scale)),
      rotationDeg: 0,
      opacity: 1,
      blend: "screen",
      appearAt: Math.max(0, clipDurationSec - 2),
      disappearAt: null,
      fadeSec: 1,
    });
  }

  return layers;
}
