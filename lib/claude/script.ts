import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// claude-sonnet-4-6 pricing per 1M tokens (USD)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

interface GenerateScriptParams {
  imageDescription: string;
  businessName: string;
  platform: string;
  tone: 'professional' | 'casual' | 'playful';
  maxWords: number;
  variationDirection?: string;
}

export interface ScriptResult {
  text: string;
  actualCostUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export async function generateScript(params: GenerateScriptParams): Promise<ScriptResult> {
  const directionLine = params.variationDirection ? `\nSpecial direction: ${params.variationDirection}` : '';
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Write a ${params.tone} social media caption for ${params.platform}.
Business: ${params.businessName}
Image: ${params.imageDescription}
Max words: ${params.maxWords}${directionLine}
Return only the caption text, no explanation.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response from Claude');

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
