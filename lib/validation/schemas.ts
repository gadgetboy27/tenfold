import { z } from 'zod';

export const createCampaignSchema = z.object({
  prompt: z.string().min(3).max(2000),
  name: z.string().max(200).optional(),
  aspectRatio: z.enum(['1:1', '4:5', '16:9', '9:16']).optional(),
  style: z.string().max(100).optional(),
  parameters: z
    .object({
      aspectRatio: z.enum(['square_hd', 'portrait_4_3', 'landscape_16_9']).optional(),
      style: z.string().max(200).optional(),
      seed: z.number().int().positive().optional(),
    })
    .default({}),
});

export const createJobSchema = z.object({
  campaignId: z.string().uuid(),
  type: z.enum([
    'image_generation',
    'image_variation',
    'upscale',
    'video_10s',
    'video_30s',
    'video_60s',
    'music_generation',
    'script_generation',
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const setAnchorSchema = z.object({
  assetId: z.string().uuid(),
});

export const createCompositionSchema = z.object({
  campaignId: z.string().uuid(),
  anchorAssetId: z.string().uuid(),
  format: z.enum(['square', 'portrait', 'landscape', 'story', 'reel']).default('square'),
  textOverlays: z
    .array(
      z.object({
        text: z.string().max(500),
        position: z.enum(['top', 'center', 'bottom']).default('bottom'),
        style: z.record(z.string(), z.string()).default({}),
      }),
    )
    .max(5)
    .default([]),
  branding: z
    .object({
      logo: z.boolean().default(false),
      primaryColor: z.boolean().default(false),
    })
    .default({ logo: false, primaryColor: false }),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string().max(100)).max(30).default([]),
});

export const publishSchema = z.object({
  compositionId: z.string().uuid(),
  platforms: z
    .array(
      z.enum([
        'instagram',
        'facebook',
        'twitter',
        'linkedin',
        'tiktok',
        'youtube',
        'pinterest',
        'reddit',
        'telegram',
        'threads',
        'snapchat',
        'bluesky',
        'gmb',
      ]),
    )
    .min(1),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(30).default([]),
  scheduledAt: z.string().datetime().optional(),
});

export const purchaseCreditsSchema = z.object({
  priceId: z.string().min(1),
});
