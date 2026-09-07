/**
 * Client-side brand font loading for the compositor canvas. Canvas fillText
 * silently falls back to a system font if the family isn't loaded, so we
 * inject the Google Fonts stylesheet once and await document.fonts before the
 * first paint (docs/tenfold-compositor-brief.md §3 — no FOUT in previews).
 */

const GOOGLE_FAMILIES =
  "family=Inter:wght@400;700&family=Montserrat:wght@400;700" +
  "&family=Playfair+Display:wght@400;700&family=Lora:wght@400;700" +
  "&family=Roboto:wght@400;700";

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
    ["Inter", "Montserrat", "Playfair Display", "Lora", "Roboto"].flatMap(
      (f) => [
        document.fonts.load(`400 64px "${f}"`),
        document.fonts.load(`700 64px "${f}"`),
      ],
    ),
  )
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined); // font failure must never block the canvas

  return loaded;
}
