import { z } from 'zod';

export const submitContentSchema = z.object({
  transcript: z.string().min(50).max(50000),
});

export const approvePublishSchema = z.object({
  schedule: z.array(
    z.object({
      platform: z.string(),
      formatKey: z.string(),
      content: z.string(),
      scheduledAt: z.string().datetime(),
    }),
  ),
});
