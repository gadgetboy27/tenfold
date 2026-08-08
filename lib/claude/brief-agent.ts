import Anthropic from "@anthropic-ai/sdk";
import {
  briefAssessmentSchema,
  type BriefAssessment,
  type BriefRequest,
} from "@/lib/brief/schema";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// claude-sonnet-4-6 pricing per 1M tokens (USD) — same basis as lib/claude/hooks.ts.
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

export interface BriefAgentResult {
  assessment: BriefAssessment;
  actualCostUsd: number;
}

/**
 * Assesses a campaign prompt: what's missing, what to ask for, and a rewritten
 * prompt that's usable right now.
 *
 * One Claude call, JSON out, Zod-parsed. The prompt below is doing the real
 * work — the constraints in it exist because the obvious failure mode is an
 * assistant that interrogates the user. See lib/brief/schema.ts.
 */
export async function assessBrief(
  req: BriefRequest,
): Promise<BriefAgentResult> {
  const have = [
    req.hasBrandKit ? "a brand kit (colours, font)" : null,
    req.hasLogo ? "a logo on file" : null,
    req.hasGalleryImages
      ? "previously generated images in their gallery"
      : null,
  ].filter(Boolean);

  const haveBlock = have.length
    ? `\n\nThis workspace ALREADY HAS: ${have.join(", ")}. Never ask for any of these — assume they will be applied automatically.`
    : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1400,
    messages: [
      {
        role: "user",
        content: `You are a creative director taking a brief from a small business owner who is NOT a marketer. They have typed a short prompt for an ad campaign. Assess it.

THEIR PROMPT:
"""
${req.prompt}
"""${haveBlock}

Return ONLY valid JSON, no prose, matching exactly:
{
  "completeness": <integer 0-100>,
  "understanding": "<one line: what you think they want>",
  "gaps": [ { "missing": "<short label>", "question": "<a question they can answer in a few words>", "example": "<a concrete example answer>" } ],
  "assetAsks": [ { "kind": "<one of: product_photo|logo|brand_colours|presenter_photo|garment_photo|reference_design|website_url|slogan>", "label": "<what to give us>", "reason": "<why it improves the result>", "importance": "high|medium|low", "sources": ["upload"|"gallery"|"brand_kit"|"text"] } ],
  "improvedPrompt": "<their prompt rewritten with everything you can already infer, usable as-is>"
}

RULES — these matter more than thoroughness:
1. NOTHING you return is mandatory. This user can always just hit generate. Frame every gap and ask as an improvement, never a requirement. Never imply they must answer first.
2. AT MOST 3 gaps and AT MOST 3 asset asks. A long list is a form, and a form is worse than the one-line prompt they started with. If the prompt is decent, return fewer or none.
3. Only ask for an asset if it MATERIALLY changes the output. A product photo transforms a product ad. A logo does not change whether the image is good. Prefer fewer, higher-impact asks.
4. Only ask for assets the platform can use: a photo of the product, a person's photo for a spokesperson video, a garment for try-on, a design/sketch to imitate, a website URL, colours, a slogan.
5. "completeness" reflects whether this will generate something GOOD, not whether it's detailed. A vivid one-liner can score 80. Corporate word-salad can score 30.
6. "improvedPrompt" must be usable immediately with NO further input. Add sensible specifics (setting, lighting, mood, audience) that are consistent with what they said. Do not invent facts about their business — no fake product names, prices, locations or claims.
7. Questions must be answerable in a few words by someone with no marketing vocabulary. Not "what is your value proposition" — "what makes yours better than the shop down the road?"
8. Write in plain New Zealand English. No jargon, no buzzwords.`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // The model occasionally wraps JSON in a fence despite the instruction.
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");

  const assessment = briefAssessmentSchema.parse(JSON.parse(json));

  const actualCostUsd =
    (message.usage.input_tokens / 1_000_000) * INPUT_COST_PER_M +
    (message.usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_M;

  return { assessment, actualCostUsd };
}
