// Fonts the compositor can actually render (brand-apply BRAND_FONTS) — kept
// client-safe (no @anthropic-ai/sdk import) so a future font picker can import
// this directly. See lib/social/caption-guide.ts for why this split matters:
// a plain data constant sharing a module with `new Anthropic(...)` gets that
// side effect bundled into any client component that imports it.
export const SUPPORTED_FONTS = [
  "Inter",
  "Montserrat",
  "Playfair Display",
  "Lora",
  "Roboto",
] as const;
export type SupportedFont = (typeof SUPPORTED_FONTS)[number];

export interface FontPairing {
  heading: SupportedFont;
  body: SupportedFont;
  rationale: string;
}
