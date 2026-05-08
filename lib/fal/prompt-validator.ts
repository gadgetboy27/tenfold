import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PromptValidation {
  score: number;
  isValid: boolean;
  issues: string[];
  refinedPrompt: string | null;
}

export async function validatePrompt(
  prompt: string,
  style: string,
): Promise<PromptValidation> {
  if (!prompt || prompt.trim().length < 5) {
    return {
      score: 0,
      isValid: false,
      issues: ['Prompt is too short — describe a subject, setting, and mood.'],
      refinedPrompt: null,
    };
  }

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `Rate this prompt for the FLUX Pro AI image generator (style: ${style}).
Prompt: "${prompt}"

Return JSON only — no other text:
{
  "score": <0-100>,
  "issues": ["<issue if any>"],
  "refinedPrompt": "<improved prompt or null>"
}

Score: 0-39 = too vague/invalid, 40-69 = acceptable, 70-100 = strong.
Issues: list only real problems (too vague, missing subject, prohibited content).
refinedPrompt: only when score < 70 and a better version is obvious, else null.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') {
    return { score: 60, isValid: true, issues: [], refinedPrompt: null };
  }

  try {
    const match = block.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no json');
    const parsed = JSON.parse(match[0]) as {
      score: number;
      issues: string[];
      refinedPrompt: string | null;
    };
    return {
      score: parsed.score ?? 60,
      isValid: (parsed.score ?? 60) >= 40,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      refinedPrompt: parsed.refinedPrompt ?? null,
    };
  } catch {
    return { score: 60, isValid: true, issues: [], refinedPrompt: null };
  }
}
