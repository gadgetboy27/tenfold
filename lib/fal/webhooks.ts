import { z } from 'zod';

const falMediaObject = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  content_type: z.string().optional(),
  file_name: z.string().optional(),
  file_size: z.number().optional(),
}).passthrough();

// fal.ai sends status as 'OK'/'ERROR' in older format and 'COMPLETED'/'FAILED' in newer.
// The result data may appear under 'payload' or 'output' depending on the model/version.
export const falWebhookPayloadSchema = z.object({
  request_id: z.string(),
  status: z.string(),
  payload: z.object({
    images:     z.array(falMediaObject).optional(),
    // Recraft vectorize returns a single `image`, not an array (verified live).
    image:      falMediaObject.optional(),
    video:      falMediaObject.optional(),
    audio_file: falMediaObject.optional(),
  }).passthrough().optional(),
  output: z.object({
    images:     z.array(falMediaObject).optional(),
    image:      falMediaObject.optional(),
    video:      falMediaObject.optional(),
    audio_file: falMediaObject.optional(),
  }).passthrough().optional(),
  error: z.unknown().optional(),
}).passthrough();

export type FalWebhookPayload = z.infer<typeof falWebhookPayloadSchema>;

export function isSuccessStatus(status: string): boolean {
  return ['OK', 'COMPLETED'].includes(status.toUpperCase());
}
