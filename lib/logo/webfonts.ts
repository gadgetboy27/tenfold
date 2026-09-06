import {
  Inter,
  Montserrat,
  Playfair_Display,
  Lora,
  Roboto,
} from "next/font/google";
import type { SupportedFont } from "./font-list";

/**
 * The five brand faces, actually loaded in the browser.
 *
 * Without these the font picker is a lie: switching to "Playfair Display"
 * changes an attribute, the browser has no such face, and the preview keeps
 * rendering in the fallback — so every option looks identical and the control
 * appears broken. Live means loaded.
 *
 * `next/font` self-hosts these at build time rather than hitting Google at
 * runtime: no third-party request from the user's browser, no layout shift
 * while a webfont arrives, and it keeps working with an outbound-blocked CSP.
 *
 * Weights are the two the lockup offers (400/700) and nothing else — each
 * extra weight is another file every visitor to this page downloads. `display:
 * swap` so a slow face shows fallback text rather than an invisible logo.
 *
 * This list is `SUPPORTED_FONTS` from ./font-list, which is itself
 * `BRAND_FONTS` from lib/composition/brand-apply.ts. All three must move
 * together: a face the picker offers but the compositor can't draw produces a
 * logo that looks right in the editor and wrong in every render after it.
 */

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});
const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

/**
 * The CSS font-family string for each face.
 *
 * `next/font` rewrites the family to a generated, scoped name, so the literal
 * "Montserrat" that goes into the SAVED svg is NOT what renders the preview —
 * the preview must use this. The saved file keeps the real family name because
 * that's what downstream renderers resolve against; see ./wordmark.ts.
 */
export const FONT_CSS: Record<SupportedFont, string> = {
  Inter: inter.style.fontFamily,
  Montserrat: montserrat.style.fontFamily,
  "Playfair Display": playfair.style.fontFamily,
  Lora: lora.style.fontFamily,
  Roboto: roboto.style.fontFamily,
};

/** Every face's class, to mount them all once so switching is instant. */
export const ALL_FONT_CLASSES = [
  inter.className,
  montserrat.className,
  playfair.className,
  lora.className,
  roboto.className,
].join(" ");
