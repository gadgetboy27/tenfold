import Anthropic from "@anthropic-ai/sdk";
import {
  wordTreatmentsSchema,
  type WordTreatment,
  DEFAULT_TREATMENT,
} from "@/lib/composition/words";
import { BRAND_FONTS } from "@/lib/composition/layers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Ask Claude how the type should LOOK — never what it should say.
 *
 * The model is given the wording only as context for judging length and tone;
 * it returns placement, font, colour and width. It has no field to put letters
 * in, and the Zod schema would reject them if it tried. That is the difference
 * between "we asked the model not to change the words" and "the model cannot
 * change the words".
 *
 * Deliberately cheap and un-charged: this is exploration, and a per-suggestion
 * fee would tax exactly the behaviour the tool exists to encourage.
 */
export async function suggestWordTreatments(params: {
  /** What the ad is about — the campaign prompt. */
  context: string;
  /** The exact wording, for length and tone only. */
  words: string;
  count?: number;
}): Promise<WordTreatment[]> {
  const count = Math.min(Math.max(params.count ?? 4, 1), 6);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: `You are a graphic designer choosing how to set type on an advert.

You choose PLACEMENT and STYLE only. You never choose or alter the wording —
the words are fixed and rendered by the design tool, not by you.

Return ONLY a JSON object: {"treatments":[...]}. Each treatment has:
- name: short label for the look (max 40 chars)
- zone: one of top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right
- font: one of ${BRAND_FONTS.join(", ")}
- color: #rrggbb hex
- widthFrac: 0.2-0.9, how much of the frame width the text block should span
- scrim: true if the type needs a dark panel behind it to stay legible
- rationale: max 120 chars on why it suits this image

Vary the options meaningfully — different zones and weights of presence, not
four variations of the same idea. Prefer high contrast; assume the artwork
behind the type is busy unless told otherwise.`,
    messages: [
      {
        role: "user",
        content: `Advert subject: ${params.context || "an advert"}
Wording to be set (do not change it, it is only here so you can judge length and tone):
"""
${params.words.slice(0, 300)}
"""
Give exactly ${count} treatments.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") return [DEFAULT_TREATMENT];

  try {
    // The model is told to return bare JSON, but a stray prose wrapper is the
    // classic failure — pull the object out rather than throwing the whole
    // suggestion away over a preamble.
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return [DEFAULT_TREATMENT];

    const parsed = wordTreatmentsSchema.safeParse(
      JSON.parse(raw.slice(start, end + 1)),
    );
    // A malformed suggestion must not break the tool: fall back to something
    // usable so the user can still place their words.
    if (!parsed.success) return [DEFAULT_TREATMENT];
    return parsed.data.treatments;
  } catch {
    return [DEFAULT_TREATMENT];
  }
}
