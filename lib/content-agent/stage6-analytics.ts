import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';
import { AnalyticsReport } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface AnalyticsContext {
  workspaceId: string;
  profileKey: string;
  userEmail: string;
  db: SupabaseClient;
}

async function fetchAyrshareAnalytics(profileKey: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://app.ayrshare.com/api/analytics', {
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      'Profile-Key': profileKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Ayrshare analytics error: ${res.status}`);
  }

  return res.json();
}

export async function generateAnalyticsReport(
  context: AnalyticsContext,
  weekEnding: Date,
): Promise<AnalyticsReport> {
  let analyticsData: Record<string, unknown> = {};

  try {
    analyticsData = await fetchAyrshareAnalytics(context.profileKey);
  } catch (error) {
    console.error('Failed to fetch Ayrshare analytics:', error);
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Analyze this week's content performance data and provide insights. Return ONLY valid JSON with no extra text or markdown.

Analytics data:
${JSON.stringify(analyticsData, null, 2)}

Return JSON with this exact structure (all fields required):
{
  "topPerformer": {
    "postId": "the post ID or description of the best performing post",
    "platform": "the platform it was on",
    "reason": "1-2 sentences explaining why it performed well"
  },
  "worstPerformer": {
    "postId": "the post ID or description",
    "platform": "platform name",
    "reason": "1-2 sentences explaining what didn't work"
  },
  "topicIdeas": [
    "First topic recommendation for next week based on performance",
    "Second topic recommendation",
    "Third topic recommendation"
  ],
  "summary": "2-3 sentence overall summary of the week's performance and key takeaway"
}

If no analytics data is available, provide reasonable recommendations based on best practices.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('No text response from Claude (Analytics)');

  const match = block.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse analytics report JSON');

  const report = JSON.parse(match[0]) as AnalyticsReport;

  await context.db.from('analytics_reports').insert({
    workspace_id: context.workspaceId,
    report_json: report,
    week_ending: weekEnding.toISOString().split('T')[0],
  });

  return report;
}

export async function sendAnalyticsEmail(
  report: AnalyticsReport,
  userEmail: string,
): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set, skipping analytics email');
      return;
    }

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const emailHtml = `
<h1>Your Content Performance Report</h1>

<h2>Top Performer</h2>
<p><strong>${report.topPerformer.platform}:</strong> ${report.topPerformer.postId}</p>
<p>Why it worked: ${report.topPerformer.reason}</p>

<h2>Needs Improvement</h2>
<p><strong>${report.worstPerformer.platform}:</strong> ${report.worstPerformer.postId}</p>
<p>What to try differently: ${report.worstPerformer.reason}</p>

<h2>Recommended Topics for Next Week</h2>
<ul>
  ${report.topicIdeas.map((idea) => `<li>${idea}</li>`).join('')}
</ul>

<p>${report.summary}</p>

<p>Keep creating great content!</p>
`;

    await resend.emails.send({
      from: 'analytics@tenfold.nz',
      to: userEmail,
      subject: 'Your Weekly Content Performance Report',
      html: emailHtml,
    });
  } catch (error) {
    console.error('Failed to send analytics email:', error);
  }
}
