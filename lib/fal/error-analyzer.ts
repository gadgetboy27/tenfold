import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface FailureAnalysis {
  explanation: string;
  isPromptIssue: boolean;
  canRetry: boolean;
  suggestedPrompt: string | null;
  fixPlan: string;
}

export async function analyzeJobFailure(params: {
  jobType: string;
  prompt: string;
  errorMessage: string;
  rawError: unknown;
}): Promise<FailureAnalysis> {
  const rawStr = JSON.stringify(params.rawError ?? {});

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are diagnosing a failed AI image generation job. Return JSON only.

Job type: ${params.jobType}
User prompt: "${params.prompt}"
Error: ${params.errorMessage}
Raw error detail: ${rawStr}

Return JSON only:
{
  "explanation": "<1-2 sentence user-friendly explanation>",
  "isPromptIssue": <true if the prompt caused or contributed to the failure>,
  "canRetry": <true if retrying with same prompt is likely to work>,
  "suggestedPrompt": "<improved prompt if isPromptIssue is true, else null>",
  "fixPlan": "<one sentence on the single best action to take>"
}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') {
    return fallback(params.errorMessage);
  }

  try {
    const match = block.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no json');
    const parsed = JSON.parse(match[0]) as FailureAnalysis;
    return {
      explanation: parsed.explanation ?? params.errorMessage,
      isPromptIssue: parsed.isPromptIssue ?? false,
      canRetry: parsed.canRetry ?? true,
      suggestedPrompt: parsed.suggestedPrompt ?? null,
      fixPlan: parsed.fixPlan ?? 'Please try again.',
    };
  } catch {
    return fallback(params.errorMessage);
  }
}

function fallback(errorMessage: string): FailureAnalysis {
  return {
    explanation: `The image generation failed: ${errorMessage}`,
    isPromptIssue: false,
    canRetry: true,
    suggestedPrompt: null,
    fixPlan: 'Please try again. Your credits have been refunded.',
  };
}
