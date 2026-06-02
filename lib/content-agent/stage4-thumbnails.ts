import { enqueueJob } from '@/lib/fal/queue';
import { AnalysisOutput, ThumbnailsOutput } from './types';

const FAL_WEBHOOK_BASE = process.env.APP_URL || 'http://localhost:3000';

export async function generateThumbnailConcepts(
  analysis: AnalysisOutput,
  submissionId: string,
): Promise<ThumbnailsOutput> {
  const topHooks = analysis.hooks.slice(0, 3);

  const concepts = topHooks.map((hook, idx) => ({
    hookText: hook,
    textOverlayCopy: hook.substring(0, 80),
    jobId: `thumb-${submissionId}-${idx}`,
    falRequestId: undefined as string | undefined,
  }));

  const thumbnailPrompts = concepts.map((concept) => {
    return `Bold, attention-grabbing thumbnail design with large text: "${concept.textOverlayCopy}"
Style: Clean, modern, high contrast
Background: Gradient or solid color that conveys the topic
Text: Bold sans-serif, white or bright color, positioned for clarity
Aspect ratio: 16:9
Professional design suitable for YouTube, TikTok, or LinkedIn`;
  });

  try {
    const results = await Promise.all(
      thumbnailPrompts.map((prompt, idx) =>
        enqueueJob(
          'image_generation',
          {
            prompt,
            image_size: 'landscape_16_9',
            num_images: 1,
          },
          `${FAL_WEBHOOK_BASE}/api/webhooks/fal?j=${concepts[idx].jobId}`,
        ),
      ),
    );

    results.forEach((result, idx) => {
      concepts[idx].falRequestId = result.requestId;
    });
  } catch (error) {
    console.error('Failed to enqueue thumbnail jobs:', error);
    throw new Error(`Thumbnail generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    campaignId: `content-agent-${submissionId}`,
    concepts,
  };
}
