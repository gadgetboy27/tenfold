import type { BlockTone, LandingTheme } from "@/lib/landing/blocks";

/**
 * Web font files for the brand faces, mirroring FONT_FILES in
 * lib/composition/export.ts.
 *
 * Self-hosted from public/fonts — the same files FFmpeg burns into the ad. So
 * the headline on the landing page is not a near-match for the headline on the
 * video, it is the identical typeface, which is the whole reason for the page
 * to exist rather than being built somewhere else.
 */
const FONT_WEB_FILES: Record<string, { regular: string; bold: string }> = {
  Inter: { regular: "Inter.ttf", bold: "Inter-Bold.ttf" },
  Montserrat: { regular: "Montserrat.ttf", bold: "Montserrat-Bold.ttf" },
  "Playfair Display": {
    regular: "PlayfairDisplay.ttf",
    bold: "PlayfairDisplay-Bold.ttf",
  },
  Lora: { regular: "Lora.ttf", bold: "Lora-Bold.ttf" },
  Roboto: { regular: "Roboto.ttf", bold: "Roboto-Bold.ttf" },
  Anton: { regular: "Anton-Regular.ttf", bold: "Anton-Regular.ttf" },
  "Bebas Neue": {
    regular: "BebasNeue-Regular.ttf",
    bold: "BebasNeue-Regular.ttf",
  },
  "Alfa Slab One": {
    regular: "AlfaSlabOne-Regular.ttf",
    bold: "AlfaSlabOne-Regular.ttf",
  },
  Bungee: { regular: "Bungee-Regular.ttf", bold: "Bungee-Regular.ttf" },
  Rye: { regular: "Rye-Regular.ttf", bold: "Rye-Regular.ttf" },
  "Special Elite": {
    regular: "SpecialElite-Regular.ttf",
    bold: "SpecialElite-Regular.ttf",
  },
};

/**
 * @font-face rules for one brand face, inlined into the page.
 *
 * Only the chosen family is emitted — a page that declares eleven faces
 * downloads none of them until used, but still pays for eleven cache entries
 * and eleven lines of render-blocking CSS.
 */
export function fontFaceCss(font: string): string {
  const files = FONT_WEB_FILES[font];
  if (!files) return "";
  const face = (file: string, weight: number) =>
    `@font-face{font-family:"${font}";src:url("/fonts/${file}") format("truetype");font-weight:${weight};font-style:normal;font-display:swap}`;
  return files.regular === files.bold
    ? // A single-cut display face: claim only 400 and let the browser
      // synthesise, rather than serving the regular file as if it were bold.
      face(files.regular, 400)
    : face(files.regular, 400) + face(files.bold, 700);
}

export function fontStack(font: string): string {
  return FONT_WEB_FILES[font]
    ? `"${font}", system-ui, -apple-system, sans-serif`
    : "system-ui, -apple-system, sans-serif";
}

export interface ToneStyle {
  background: string;
  color: string;
  /** Muted body text that still passes contrast on this background. */
  subColor: string;
  /** A button sitting on this background. */
  buttonBg: string;
  buttonColor: string;
}

/**
 * A landing page is the CUSTOMER's brand, not our app's chrome, so it renders
 * in fixed light-mode colours regardless of the visitor's OS theme. A prospect
 * whose laptop is in dark mode should still see the page the business signed
 * off on — inheriting `prefers-color-scheme` here would mean two different
 * pages exist and only one of them was ever reviewed.
 */
export function toneStyle(tone: BlockTone, theme: LandingTheme): ToneStyle {
  switch (tone) {
    case "muted":
      return {
        background: "#f5f5f4",
        color: "#1c1917",
        subColor: "#57534e",
        buttonBg: theme.primary,
        buttonColor: "#ffffff",
      };
    case "brand":
      return {
        background: theme.primary,
        color: "#ffffff",
        subColor: "rgba(255,255,255,0.85)",
        // On a brand-coloured band the button has to leave the brand colour to
        // stay visible; the accent is what the accent is for.
        buttonBg: theme.accent,
        buttonColor: "#1c1917",
      };
    case "dark":
      return {
        background: "#1c1917",
        color: "#fafaf9",
        subColor: "rgba(250,250,249,0.7)",
        buttonBg: theme.accent,
        buttonColor: "#1c1917",
      };
    default:
      return {
        background: "#ffffff",
        color: "#1c1917",
        subColor: "#57534e",
        buttonBg: theme.primary,
        buttonColor: "#ffffff",
      };
  }
}
