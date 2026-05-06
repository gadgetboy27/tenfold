import { z } from 'zod';

export const falWebhookPayloadSchema = z.object({
  request_id: z.string(),
  status: z.enum(['OK', 'ERROR']),
  payload: z
    .object({
      images: z
        .array(
          z.object({
            url: z.string().url(),
            width: z.number().optional(),
            height: z.number().optional(),
            content_type: z.string().optional(),
          }),
        )
        .optional(),
      video: z
        .object({
          url: z.string().url(),
          content_type: z.string().optional(),
        })
        .optional(),
      audio_file: z
        .object({ url: z.string().url(), content_type: z.string().optional() })
        .optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export type FalWebhookPayload = z.infer<typeof falWebhookPayloadSchema>;
