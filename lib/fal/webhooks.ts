import { z } from 'zod';

// Every field but `url` is nullish, not optional: fal omits some metadata on
// some models and sends an explicit `null` on others (Recraft's webp output
// returns `file_size: null`). `.optional()` accepts undefined but REJECTS null,
// which silently binned whole batches of finished images at the webhook door.
const falMediaObject = z.object({
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  content_type: z.string().nullish(),
  file_name: z.string().nullish(),
  file_size: z.number().nullish(),
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
    // ACE-Step (vocals) returns `audio`, not `audio_file` — normalized downstream.
    audio:      falMediaObject.optional(),
  }).passthrough().optional(),
  output: z.object({
    images:     z.array(falMediaObject).optional(),
    image:      falMediaObject.optional(),
    video:      falMediaObject.optional(),
    audio_file: falMediaObject.optional(),
    // ACE-Step (vocals) returns `audio`, not `audio_file` — normalized downstream.
    audio:      falMediaObject.optional(),
  }).passthrough().optional(),
  error: z.unknown().optional(),
}).passthrough();

export type FalWebhookPayload = z.infer<typeof falWebhookPayloadSchema>;

export function isSuccessStatus(status: string): boolean {
  return ['OK', 'COMPLETED'].includes(status.toUpperCase());
}
