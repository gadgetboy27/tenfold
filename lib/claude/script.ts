import Anthropic from "@anthropic-ai/sdk";
import { getCaptionModel } from "./caption-models";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface GenerateScriptParams {
  imageDescription: string;
  businessName: string;
  platform: string;
  tone: "professional" | "casual" | "playful";
  maxWords: number;
  variationDirection?: string;
  /** Workspace brand-voice style guide; when present the caption must match it. */
  brandVoice?: string;
  /** Which caption model to write with (see caption-models.ts). Defaults to Studio. */
  captionModel?: string;
}

export interface ScriptResult {
  text: string;
  actualCostUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export async function generateScript(
  params: GenerateScriptParams,
): Promise<ScriptResult> {
  const directionLine = params.variationDirection
    ? `\nSpecial direction: ${params.variationDirection}`
    : "";
  // Brand voice takes precedence over the generic tone — it's what stops every
  // caption sounding the same.
  const voiceBlock = params.brandVoice
    ? `\n\nMATCH THIS BRAND VOICE EXACTLY (overrides the generic tone above):\n${params.brandVoice}`
    : "";
  const captionModel = getCaptionModel(params.captionModel);
  const message = await anthropic.messages.create({
    model: captionModel.model,
    max_tokens: 512,
    system: `You are an award-winning social media copywriter who writes scroll-stopping captions that convert. You know each platform's native voice cold and never sound like a corporate press release.

Craft rules:
- Open with a HOOK in the first 5–7 words — a pattern interrupt, bold claim, question, or tension. The first line has to earn the second.
- Write like a human talks, not like a brand brochure. Specific > generic. Show the benefit, don't announce it.
- One clear idea. End with a light, native call-to-action (a nudge, not a beg).
- Platform-native: TikTok/Reels = punchy, playful, lowercase-casual; LinkedIn = sharp insight, credible; Instagram = vivid, aspirational; X = witty, tight.
- BANNED: "Elevate", "Unlock", "Discover", "Level up", "Game-changer", "In today's fast-paced world", "Look no further", "We are excited to", hashtag soup, and any cliché you've seen a thousand times.
- Emoji: at most 1–2, only if they add meaning. Hashtags: 0–3, genuinely relevant, never a wall.
- Respect the max word count as a hard ceiling — shorter that lands beats longer that pads.`,
    messages: [
      {
        role: "user",
        content: `Write ONE ${params.tone} caption for ${params.platform}.
Business: ${params.businessName}
What's in the image: ${params.imageDescription}
Hard max: ${params.maxWords} words${directionLine}${voiceBlock}
Return only the caption — no preamble, no quotes, no "Caption:" label, no options.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from Claude");

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const actualCostUsd =
    (inputTokens / 1_000_000) * captionModel.inputCostPerM +
    (outputTokens / 1_000_000) * captionModel.outputCostPerM;

  return {
    text: block.text.trim(),
    actualCostUsd,
    inputTokens,
    outputTokens,
  };
}
