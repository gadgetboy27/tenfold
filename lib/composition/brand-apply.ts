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

/** Word-wrap onto \n so long AI captions render as a readable block instead
 *  of one line running off the frame (canvas and drawtext both honour \n). */
export function wrapText(text: string, maxChars = 26): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export function brandKitLayers(
  kit: BrandKitInfo,
  aspect: CompositionAspect,
  clipDurationSec: number,
  logoNaturalWidth: number | null,
  /** The campaign's AI caption (Step 3/4). When present it becomes the main
   *  text layer and the kit tagline moves to the end card with the logo. */
  caption?: string | null,
): Layer[] {
  const design = ASPECT_DESIGN[aspect];
  const layers: Layer[] = [];
  const endCardAt = Math.max(0, clipDurationSec - 2);

  const font: BrandFont = (BRAND_FONTS as readonly string[]).includes(
    kit.font_family ?? "",
  )
    ? (kit.font_family as BrandFont)
    : "Inter";

  const tagline = kit.tagline?.trim();
  const mainText = caption?.trim() || tagline;
  if (mainText) {
    layers.push({
      id: crypto.randomUUID(),
      kind: "text",
      text: wrapText(mainText),
      font,
      sizePx: Math.round(design.width / 22),
      color: "#ffffff",
      x: design.width / 2,
      y: Math.round(design.height * 0.84),
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
      effects: {
        in: { kind: "rise", durationSec: 0.8 },
        out: { kind: "none", durationSec: 0.8 },
        loop: "none",
      },
    });
  }

  // With a caption as the main text, the tagline joins the logo on the
  // end card instead of being dropped.
  if (caption?.trim() && tagline && tagline !== caption.trim()) {
    layers.push({
      id: crypto.randomUUID(),
      kind: "text",
      text: wrapText(tagline, 32),
      font,
      sizePx: Math.round(design.width / 26),
      color: "#ffffff",
      x: design.width / 2,
      y: Math.round(design.height * 0.6),
      scale: 1,
      rotationDeg: 0,
      opacity: 0.9,
      blend: "normal",
      appearAt: endCardAt,
      disappearAt: null,
      fadeSec: 0,
      effects: {
        in: { kind: "fade", durationSec: 1 },
        out: { kind: "none", durationSec: 0.8 },
        loop: "none",
      },
    });
  }

  const logoSrc = pickKitLogo(kit);
  if (logoSrc) {
    // Target ~35% of frame width for the end-card mark — prominent without
    // dominating, and easy to nudge bigger with the scale slider.
    const scale = logoNaturalWidth
      ? (design.width * 0.35) / logoNaturalWidth
      : 0.4;
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
      appearAt: endCardAt,
      disappearAt: null,
      fadeSec: 0,
      effects: {
        in: { kind: "fade", durationSec: 1 },
        out: { kind: "none", durationSec: 0.8 },
        loop: "none",
      },
    });
  }

  return layers;
}
