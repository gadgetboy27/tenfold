import Anthropic from '@anthropic-ai/sdk';
import { AnalysisOutput, RepurposeOutput } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateYoutubeDescription(analysis: AnalysisOutput, transcript: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Write a YouTube video description for this content. Include relevant keywords naturally, structure with key insights as bullet points, and include a CTA.

Topic: ${analysis.mainTopic}
Insights: ${analysis.keyInsights.join(', ')}
Tone: ${analysis.tone}

Requirements:
- Exactly 300 words
- SEO-optimized with relevant keywords
- 3-5 key insights as bullet points
- One clear CTA at the end
- Return ONLY the description text, no extra formatting`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('No text response from Claude (YouTube)');
  return block.text.trim();
}

async function generateLinkedinPost(analysis: AnalysisOutput): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Write a professional LinkedIn post about this content. Use a conversational but authoritative tone.

Topic: ${analysis.mainTopic}
Key insights: ${analysis.keyInsights.slice(0, 3).join(', ')}
Target audience: ${analysis.targetAudience}

Requirements:
- Exactly 1800 characters maximum
- Start with a hook from: ${analysis.hooks[0]}
- Include 3 key points as separate paragraphs
- One reflective question to drive engagement
- Subtle CTA (e.g., "What's your experience?")
- Professional but warm tone
- Return ONLY the post text`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('No text response from Claude (LinkedIn)');
  return block.text.trim();
}

async function generateTwitterThread(analysis: AnalysisOutput): Promise<string[]> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Create an 8-tweet thread about this content. Tweet 1 is the hook, tweets 2-7 expand on insights, tweet 8 is the CTA.

Topic: ${analysis.mainTopic}
Insights: ${analysis.keyInsights.join(', ')}
Hooks to choose from: ${analysis.hooks.slice(0, 5).join(', ')}

Requirements:
- Exactly 8 tweets
- Tweet 1 (hook): Use one of the provided hooks, max 120 chars
- Tweets 2-7: Each is 1-2 sentences about a different insight, max 240 chars each
- Tweet 8: CTA and engagement question, max 180 chars
- Use Twitter threading format (1/, 2/, etc.)
- Conversational and authentic
- Return as JSON array of 8 strings, ONLY the JSON, no markdown or extra text

Format: ["Tweet 1", "Tweet 2", ...]`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('No text response from Claude (Twitter)');

  const match = block.text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse Twitter thread JSON');

  const parsed = JSON.parse(match[0]) as string[];
  if (!Array.isArray(parsed) || parsed.length !== 8) {
    throw new Error('Twitter thread must be exactly 8 tweets');
  }
  return parsed;
}

async function generateInstagramCaption(analysis: AnalysisOutput): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Write an Instagram caption for this content. Conversational, relatable, with hashtags.

Topic: ${analysis.mainTopic}
Key points: ${analysis.keyInsights.slice(0, 3).join(', ')}

Requirements:
- Exactly 150 words
- Hook: ${analysis.hooks[1]}
- Conversational and relatable tone
- 5 relevant hashtags at the end
- One call-to-action (e.g., DM, comment, save)
- Return ONLY the caption text with hashtags`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('No text response from Claude (Instagram)');
  return block.text.trim();
}

async function generateTiktokScript(analysis: AnalysisOutput): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Write a TikTok script for a 60-second video. Hook in first 3 seconds, deliver value fast, end with engagement.

Topic: ${analysis.mainTopic}
Insights: ${analysis.keyInsights.join(', ')}

Requirements:
- Exactly 60 seconds when read at natural speaking pace (approx 150-160 words)
- Hook: ${analysis.hooks[2]}
- First 3 seconds: Grab attention with a question or statement
- Next 45 seconds: Break down 2-3 key insights
- Last 12 seconds: CTA (follow, like, comment, duet)
- Casual, energetic tone
- Short punchy sentences
- Return ONLY the script text`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('No text response from Claude (TikTok)');
  return block.text.trim();
}

async function generateEmailNewsletter(analysis: AnalysisOutput): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Write an email newsletter about this content. Story-driven, one CTA, reader-focused.

Topic: ${analysis.mainTopic}
Insights: ${analysis.keyInsights.join(', ')}
Audience: ${analysis.targetAudience}

Requirements:
- Exactly 400 words
- Subject line first: "Subject: [relevant, curiosity-driven subject]"
- Opening: Relatable story or question (3-4 sentences)
- Main body: Insights structured as 2-3 sections
- One clear CTA at the end
- Professional but conversational tone
- End with a signature line
- Return ONLY the full email with subject line included`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('No text response from Claude (Email)');
  return block.text.trim();
}

export async function repurposeContent(
  analysis: AnalysisOutput,
  transcript: string,
): Promise<RepurposeOutput> {
  const [youtube, linkedin, twitter, instagram, tiktok, email] = await Promise.all([
    generateYoutubeDescription(analysis, transcript),
    generateLinkedinPost(analysis),
    generateTwitterThread(analysis),
    generateInstagramCaption(analysis),
    generateTiktokScript(analysis),
    generateEmailNewsletter(analysis),
  ]);

  return {
    youtubeDescription: youtube,
    linkedinPost: linkedin,
    twitterThread: twitter,
    instagramCaption: instagram,
    tiktokScript: tiktok,
    emailNewsletter: email,
  };
}
