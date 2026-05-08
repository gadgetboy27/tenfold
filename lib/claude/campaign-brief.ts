import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CampaignAngle {
  id: string;
  title: string;
  goal: 'awareness' | 'conversion' | 'engagement' | 'retention';
  strategy: string;
  keyMessage: string;
  visualStyle: string;
  imagePrompt: string;
  platforms: string[];
}

export interface CampaignBrief {
  url: string;
  businessSummary: string;
  industry: string;
  targetAudience: string;
  uniqueValueProp: string;
  industryInsights: string;
  campaignAngles: CampaignAngle[];
  suggestedQuestions: string[];
  recommendedPlatforms: string[];
}

export interface PageContent {
  title: string;
  description: string;
  headings: string[];
  bodyText: string;
  ogImage?: string;
}

export async function analyzeCampaignUrl(
  url: string,
  page: PageContent,
  userNotes: string,
): Promise<CampaignBrief> {
  const headingStr = page.headings.slice(0, 12).join(' · ');
  const notesSection = userNotes.trim()
    ? `\n\nAdditional context from the client: "${userNotes.trim()}"`
    : '';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are a senior marketing strategist with expertise in digital advertising, brand positioning, and social media campaigns. Analyze this website and produce a comprehensive marketing campaign brief.

Website URL: ${url}
Page title: ${page.title}
Meta description: ${page.description}
Key headings found: ${headingStr || 'none'}
Page content excerpt:
---
${page.bodyText.slice(0, 2500)}
---${notesSection}

Using the above content AND your deep knowledge of this industry — including typical competitors, market dynamics, content that resonates with the audience, and platform-specific best practices — create a marketing brief.

Return ONLY valid JSON with no extra text, markdown or code blocks:
{
  "businessSummary": "2-3 sentence plain-English summary of what this business does and who it serves",
  "industry": "e.g. SaaS, E-commerce, Healthcare, Real Estate, etc.",
  "targetAudience": "Primary audience (demographics, job roles, pain points) and secondary audience if relevant",
  "uniqueValueProp": "Their single strongest differentiator in one sentence",
  "industryInsights": "2-3 sentences on the competitive landscape, market trends, and what campaigns are working well in this space right now",
  "campaignAngles": [
    {
      "id": "awareness",
      "title": "Short angle title (4-6 words)",
      "goal": "awareness",
      "strategy": "2-3 sentences: what this campaign does, why it works for this brand, what emotion or action it targets",
      "keyMessage": "The single core message a viewer should take away",
      "visualStyle": "Detailed visual direction: lighting, colour palette, subject matter, composition, mood — enough to prompt an image generator",
      "imagePrompt": "A complete, production-ready prompt for FLUX Pro image generation that captures this angle visually. Include subject, setting, style, lighting, mood. ~60 words.",
      "platforms": ["instagram", "linkedin"]
    }
  ],
  "suggestedQuestions": [
    "What is the primary goal — brand awareness, lead generation, or direct sales?",
    "Do you have a seasonal offer, launch event or promotion to highlight?",
    "Is there a specific geography or demographic segment to prioritise?",
    "What budget level are you working with — startup, growth, or enterprise scale?"
  ],
  "recommendedPlatforms": ["instagram", "linkedin"]
}

Provide exactly 4 campaign angles covering different goals: awareness, conversion, engagement, and one wild-card creative angle suited to this specific brand. Each imagePrompt must be visually specific and different — not generic stock-photo descriptions. Think like a creative director.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('No response from Claude');

  const match = block.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse brief from Claude response');

  const parsed = JSON.parse(match[0]) as Omit<CampaignBrief, 'url'>;
  return { ...parsed, url };
}
