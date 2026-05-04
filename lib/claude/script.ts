import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface GenerateScriptParams {
  imageDescription: string;
  businessName: string;
  platform: string;
  tone: 'professional' | 'casual' | 'playful';
  maxWords: number;
}

export async function generateScript(params: GenerateScriptParams): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Write a ${params.tone} social media caption for ${params.platform}.
Business: ${params.businessName}
Image: ${params.imageDescription}
Max words: ${params.maxWords}
Return only the caption text, no explanation.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response from Claude');
  return block.text.trim();
}
