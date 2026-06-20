import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// claude-sonnet-4-6 pricing per 1M tokens (USD)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

export interface HookVariant {
  /** The copywriting angle, e.g. "Curiosity", "Urgency", "Social proof". */
  angle: string;
  text: string;
}

export interface HookVariantsParams {
  /** What's being promoted (product, offer, topic). */
  topic: string;
  platform: string;
  tone: "professional" | "casual" | "playful";
  count: number;
  brandVoice?: string;
}

export interface HookVariantsResult {
  variants: HookVariant[];
  actualCostUsd: number;
}

/**
 * Generates N distinct ad hooks for A/B testing — each in a different proven
 * angle. One Claude call; output parsed from `Angle: text` lines.
 */
export async function generateHookVariants(
  params: HookVariantsParams,
): Promise<HookVariantsResult> {
  const voiceBlock = params.brandVoice
    ? `\n\nMATCH THIS BRAND VOICE:\n${params.brandVoice}`
    : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 900,
    messages: [
      {
        role: "user",
        content: `You are a direct-response ad copywriter. Write ${params.count} DISTINCT scroll-stopping hooks (opening lines) for a ${params.platform} ad, each using a DIFFERENT proven angle (e.g. curiosity, urgency, bold claim, pain-point, social proof, question, benefit, contrarian).

Promoting: ${params.topic}
Tone: ${params.tone}${voiceBlock}

Rules:
- Each hook is ONE punchy line (max ~15 words).
- Every hook must use a different angle.
- Return ONLY ${params.count} lines, each in EXACTLY this format: Angle: hook text
- No numbering, no preamble, no extra commentary.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from Claude");

  const variants: HookVariant[] = block.text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { angle: "Hook", text: line };
      return { angle: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() };
    })
    .filter((v) => v.text.length > 0);

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const actualCostUsd =
    (inputTokens / 1_000_000) * INPUT_COST_PER_M +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

  return { variants, actualCostUsd };
}
