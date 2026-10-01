import Anthropic from "@anthropic-ai/sdk";
import { getCaptionModel } from "./caption-models";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** A slogan is one short sentence. Longer than this stops being a slogan. */
export const SLOGAN_MAX_WORDS = 12;
export const SLOGAN_COUNT = 3;

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Turn the model's reply into clean slogans: at most SLOGAN_COUNT, each ONE
 * sentence of at most SLOGAN_MAX_WORDS words, no numbering, quotes or labels,
 * no repeats. Pure and defensive because the model is asked for a JSON array
 * but a stray preamble, a numbered list or a two-sentence "slogan" all happen,
 * and a slogan that runs to a paragraph would defeat the point of the feature
 * — so overlong ones are DROPPED rather than trimmed mid-thought.
 */
export function normalizeSlogans(raw: string): string[] {
  let items: string[] = [];
  const array = raw.match(/\[[\s\S]*\]/);
  if (array) {
    try {
      const parsed: unknown = JSON.parse(array[0]);
      if (Array.isArray(parsed)) {
        items = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      /* fall through to line parsing */
    }
  }
  if (items.length === 0) items = raw.split("\n");

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const cleaned = item
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    const words = wordCount(cleaned);
    if (words > SLOGAN_MAX_WORDS) continue;
    // One sentence. A short run of fragments ("Fresh. Fast. Yours.") is a
    // classic slogan and fits on one line, so only a LONGER line with an
    // internal full stop counts as the multiple sentences we refuse.
    if (words > 7 && /[.!?]\s+\S/.test(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length === SLOGAN_COUNT) break;
  }
  return out;
}

export interface SloganResult {
  slogans: string[];
  actualCostUsd: number;
}

export async function generateSlogans(params: {
  /** What the product or service is — the user's own description. */
  description: string;
  /** The workspace's real brand name, when set. Never invented. */
  businessName?: string;
  brandVoice?: string;
  captionModel?: string;
}): Promise<SloganResult> {
  const model = getCaptionModel(params.captionModel);
  const nameLine = params.businessName?.trim()
    ? `Brand name: ${params.businessName.trim()}`
    : "The brand's name is NOT provided — do not invent or guess one.";
  const voice = params.brandVoice
    ? `\n\nMATCH THIS BRAND VOICE:\n${params.brandVoice}`
    : "";

  const message = await anthropic.messages.create({
    model: model.model,
    max_tokens: 300,
    system: `You are a senior advertising copywriter who writes slogans — the single line that sits on an ad.

A slogan is NOT a caption. It is far shorter and more direct:
- ONE sentence, ${SLOGAN_MAX_WORDS} words at the very most; 4–8 is better.
- Concrete and confident. Say the thing, don't hint at it. Rhythm and a hard edge beat cleverness.
- No hashtags, no emoji, no quotation marks, no "we", no questions unless they land.
- BANNED clichés: "Elevate", "Unlock", "Discover", "Level up", "Game-changer", "Look no further", "Your journey", "Redefine".
- Give ${SLOGAN_COUNT} genuinely different angles (e.g. the benefit, a challenge to the reader, a wordplay on the product) — not three rewordings of one idea.`,
    messages: [
      {
        role: "user",
        content: `${nameLine}
What it is: ${params.description}${voice}

Write ${SLOGAN_COUNT} slogans. Return ONLY a JSON array of ${SLOGAN_COUNT} strings, nothing else.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from Claude");
  const slogans = normalizeSlogans(block.text);
  if (slogans.length === 0) {
    throw new Error(
      "Couldn't write a usable slogan — try describing it a little differently.",
    );
  }
  const actualCostUsd =
    (message.usage.input_tokens / 1_000_000) * model.inputCostPerM +
    (message.usage.output_tokens / 1_000_000) * model.outputCostPerM;
  return { slogans, actualCostUsd };
}
