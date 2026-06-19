import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// claude-sonnet-4-6 pricing per 1M tokens (USD)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

// Spoken delivery is ~2.5 words/second; bound the script to the target length so
// the generated voiceover actually fits the requested clip duration.
const WORDS_PER_SECOND = 2.5;

export interface AdScriptParams {
  productName: string;
  productDescription: string;
  features: string[];
  callToAction: string;
  tone: "professional" | "casual" | "playful";
  targetSeconds: number;
  /** Workspace brand-voice style guide; when present the script must match it. */
  brandVoice?: string;
  /** Target language name (e.g. "Spanish"). Defaults to English when omitted. */
  language?: string;
}

export interface AdScriptResult {
  text: string;
  actualCostUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Writes the spoken words for an on-camera spokesperson launching a product.
 * Output is pure speech (no stage directions) so it can be fed straight to TTS
 * and lip-synced.
 */
export async function generateAdScript(
  params: AdScriptParams,
): Promise<AdScriptResult> {
  const maxWords = Math.max(
    12,
    Math.round(params.targetSeconds * WORDS_PER_SECOND),
  );
  const featureLines = params.features
    .filter(Boolean)
    .map((f) => `- ${f}`)
    .join("\n");
  const voiceBlock = params.brandVoice
    ? `\n\nMATCH THIS BRAND VOICE EXACTLY (overrides the generic tone):\n${params.brandVoice}`
    : "";
  const languageBlock =
    params.language && params.language.toLowerCase() !== "english"
      ? `\n\nWrite the ENTIRE script in ${params.language} — natural, native-sounding ${params.language}, not a literal translation.`
      : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Write a ${params.tone}, spoken-word ad script for an on-camera spokesperson launching a product. It will be read aloud and lip-synced, so write ONLY the words to be spoken — no stage directions, no scene labels, no markdown, no quotes.

Product: ${params.productName}
${params.productDescription ? `What it is: ${params.productDescription}` : ""}
${featureLines ? `Key selling points:\n${featureLines}` : ""}
${params.callToAction ? `End with this call to action: ${params.callToAction}` : ""}

Constraints:
- About ${maxWords} words (must fit ~${params.targetSeconds} seconds when spoken aloud).
- Open with a hook in the first sentence.
- Natural, conversational, easy to say out loud.${voiceBlock}${languageBlock}

Return only the spoken script text.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from Claude");

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const actualCostUsd =
    (inputTokens / 1_000_000) * INPUT_COST_PER_M +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

  return {
    text: block.text.trim(),
    actualCostUsd,
    inputTokens,
    outputTokens,
  };
}
