import Anthropic from "@anthropic-ai/sdk";
import type { LogoBrief } from "./brief";

// Font pairing (Phase 3b). One Claude call recommends a heading + body pairing —
// but CONSTRAINED to the fonts the compositor can actually render (brand-apply
// BRAND_FONTS), so the recommendation is usable in the marketing pipeline, not
// an arbitrary Google font the video renderer doesn't have.

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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function coerceFont(value: unknown, fallback: SupportedFont): SupportedFont {
  return (SUPPORTED_FONTS as readonly string[]).includes(value as string)
    ? (value as SupportedFont)
    : fallback;
}

export async function suggestFontPairing(
  brief: LogoBrief,
): Promise<FontPairing> {
  const p = brief.personality;
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system: `You are a brand typographer. Recommend a heading + body font pairing for a business's brand.
You MUST choose both fonts ONLY from this exact list: ${SUPPORTED_FONTS.join(", ")}.
Return ONLY minified JSON: {"heading":"<font>","body":"<font>","rationale":"<one short sentence>"}. No prose, no code fence.`,
    messages: [
      {
        role: "user",
        content: `Business: ${brief.businessName}${brief.industry ? ` (${brief.industry})` : ""}
Personality (0-100): classic→modern ${p.classicModern}, playful→serious ${p.playfulSerious}, minimal→detailed ${p.minimalDetailed}, warm→cool ${p.warmCool}.
Pick the heading and body fonts.`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  // Defensive parse — the model may wrap or add stray characters.
  const match = text.match(/\{[\s\S]*\}/);
  let parsed: { heading?: unknown; body?: unknown; rationale?: unknown } = {};
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      parsed = {};
    }
  }
  return {
    heading: coerceFont(parsed.heading, "Montserrat"),
    body: coerceFont(parsed.body, "Inter"),
    rationale:
      typeof parsed.rationale === "string"
        ? parsed.rationale.slice(0, 200)
        : "A clean, versatile pairing.",
  };
}
