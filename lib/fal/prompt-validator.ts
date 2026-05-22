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

  const styleGuide: Record<string, string> = {
    Photorealistic: 'needs a clear subject + setting + lighting (e.g. "founder at a tech conference, golden hour backlight, DSLR close-up"). Vague prompts produce muddy photos.',
    Illustration:   'needs a clear subject + colour mood + art direction (e.g. "bold flat-colour vector of a coffee cup, warm pastels, minimal background"). Abstract prompts produce generic clip-art.',
    Cinematic:      'needs a scene/moment + mood + lighting direction (e.g. "CEO walking through glass office, dramatic low-key side lighting, wide shot"). Needs enough narrative tension to feel like a movie still.',
    '3D':           'needs a clear object or scene + surface material + lighting environment (e.g. "floating product bottle, matte white with gold accents, studio HDRI"). Abstract prompts produce shapeless geometry.',
  };

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 350,
    messages: [
      {
        role: 'user',
        content: `Rate this prompt for FLUX Pro, a photorealistic AI image model. Style requested: ${style}.
Style guidance: ${styleGuide[style] ?? 'needs a clear subject, setting, and mood.'}
Prompt: "${prompt}"

Return JSON only — no other text:
{
  "score": <0-100>,
  "issues": ["<issue if any>"],
  "refinedPrompt": "<improved prompt or null>"
}

Score: 0-39 = too vague/will fail, 40-69 = acceptable, 70-100 = strong.
Issues: only flag real problems (missing subject, too abstract, prohibited content). Do NOT nitpick good prompts.
refinedPrompt: rewrite only when score < 70 and improvement is obvious. Keep the user's intent. Match the ${style} style.`,
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
