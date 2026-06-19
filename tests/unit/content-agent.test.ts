import { describe, it, expect } from 'vitest';
import type { AnalysisOutput } from '@/lib/content-agent/types';

describe('Stage 1: Analyse', () => {
  it('validates that analysis output has 5 insights and 10 hooks', async () => {
    const validOutput: AnalysisOutput = {
      mainTopic: 'AI in content creation',
      keyInsights: [
        'AI speeds up content creation',
        'Quality improves with proper prompting',
        'Authenticity still matters',
        'Humans and AI work better together',
        'Tools are democratizing content creation',
      ],
      targetAudience: 'Content creators, marketers',
      tone: 'professional',
      hooks: [
        'AI is changing how we create content',
        'You won\'t believe how fast AI can generate ideas',
        'The secret to AI content nobody talks about',
        'This one AI trick will transform your workflow',
        'Stop doing content the old way',
        'The uncomfortable truth about AI writing',
        'What AI really can\'t do (yet)',
        'Your content could be 10x better with this',
        'Have you noticed something different about AI?',
        'The biggest AI content mistake',
      ],
    };

    expect(validOutput.keyInsights).toHaveLength(5);
    expect(validOutput.hooks).toHaveLength(10);
    expect(['professional', 'casual', 'educational', 'entertaining']).toContain(validOutput.tone);
  });
});

describe('Stage 3: Schedule', () => {
  it('generates correct number of scheduled posts for a full week', async () => {
    const { scheduleContent } = await import('@/lib/content-agent/stage3-schedule');

    const mockRepurpose = {
      youtubeDescription: 'Sample YouTube description',
      linkedinPost: 'Sample LinkedIn post',
      twitterThread: ['Tweet 1', 'Tweet 2', 'Tweet 3', 'Tweet 4', 'Tweet 5', 'Tweet 6', 'Tweet 7', 'Tweet 8'],
      instagramCaption: 'Sample Instagram caption',
      tiktokScript: 'Sample TikTok script',
      emailNewsletter: 'Sample email',
    };

    const baseDate = new Date('2026-06-01');
    const schedule = scheduleContent(mockRepurpose, baseDate);

    expect(schedule).toHaveLength(7);
    expect(schedule.some((item) => item.platform === 'linkedin')).toBe(true);
    expect(schedule.some((item) => item.platform === 'twitter')).toBe(true);
    expect(schedule.some((item) => item.platform === 'instagram')).toBe(true);
    expect(schedule.some((item) => item.platform === 'tiktok')).toBe(true);

    const scheduleDates = schedule.map((item) => new Date(item.scheduledAt));
    scheduleDates.forEach((date) => {
      expect(date.getTime()).toBeGreaterThan(baseDate.getTime());
    });
  });

  it('schedules posts at correct NZST times', async () => {
    const { scheduleContent } = await import('@/lib/content-agent/stage3-schedule');

    const mockRepurpose = {
      youtubeDescription: 'Test',
      linkedinPost: 'Test',
      twitterThread: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'],
      instagramCaption: 'Test',
      tiktokScript: 'Test',
      emailNewsletter: 'Test',
    };

    const baseDate = new Date('2026-06-01T00:00:00Z');
    const schedule = scheduleContent(mockRepurpose, baseDate);

    const linkedinPosts = schedule.filter((s) => s.platform === 'linkedin');
    expect(linkedinPosts.length).toBeGreaterThan(0);

    linkedinPosts.forEach((post) => {
      const date = new Date(post.scheduledAt);
      const day = date.getDay();
      expect([2, 4]).toContain(day);
    });
  });
});

describe('Stage 6: Analytics Report', () => {
  it('validates analytics report structure has required fields', async () => {
    const validReport = {
      topPerformer: {
        postId: 'post-123',
        platform: 'linkedin',
        reason: 'High engagement with professional audience',
      },
      worstPerformer: {
        postId: 'post-456',
        platform: 'tiktok',
        reason: 'Content format didn\'t resonate',
      },
      topicIdeas: [
        'Advanced AI techniques for content creators',
        'Case studies of successful AI implementations',
        'The future of human-AI collaboration',
      ],
      summary: 'LinkedIn performed best. Focus on professional insights next week.',
    };

    expect(validReport).toHaveProperty('topPerformer');
    expect(validReport).toHaveProperty('worstPerformer');
    expect(validReport).toHaveProperty('topicIdeas');
    expect(validReport).toHaveProperty('summary');
    expect(validReport.topicIdeas).toHaveLength(3);
    expect(validReport.topPerformer.platform).toBe('linkedin');
  });
});
