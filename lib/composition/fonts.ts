import { BRAND_FONTS, weightsFor } from "@/lib/composition/layers";

/**
 * Client-side brand font loading for the compositor canvas. Canvas fillText
 * silently falls back to a system font if the family isn't loaded, so we
 * inject the Google Fonts stylesheet once and await document.fonts before the
 * first paint (docs/tenfold-compositor-brief.md §3 — no FOUT in previews).
 */

// Text faces carry both weights; display faces ship one cut, so asking for
// :wght@700 on them would have Google serve 400 and the browser fake the rest.
const GOOGLE_FAMILIES =
  "family=Inter:wght@400;700&family=Montserrat:wght@400;700" +
  "&family=Playfair+Display:wght@400;700&family=Lora:wght@400;700" +
  "&family=Roboto:wght@400;700" +
  "&family=Anton&family=Bebas+Neue&family=Alfa+Slab+One" +
  "&family=Bungee&family=Rye&family=Special+Elite";

const LINK_ID = "tf-compositor-fonts";

let loaded: Promise<void> | null = null;

export function ensureBrandFontsLoaded(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (loaded) return loaded;

  if (!document.getElementById(LINK_ID)) {
    const link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${GOOGLE_FAMILIES}&display=swap`;
    document.head.appendChild(link);
  }

  // BOTH weights, explicitly. `document.fonts.load` resolves per weight, so
  // loading only the 400 face leaves canvas fillText with nothing to draw 700
  // with — and canvas falls back SILENTLY, which is the whole failure mode
  // this module exists to prevent.
  loaded = Promise.all(
    BRAND_FONTS.flatMap((f) =>
      // Only the weights the family really has — see FONT_WEIGHTS. Loading a
      // weight that doesn't exist resolves anyway and teaches nothing.
      weightsFor(f).map((w) => document.fonts.load(`${w} 64px "${f}"`)),
    ),
  )
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined); // font failure must never block the canvas

  return loaded;
}
