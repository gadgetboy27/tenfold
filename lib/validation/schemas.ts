import { z } from "zod";
import { backgroundSchema, layerSchema } from "@/lib/composition/layers";

export const createCampaignSchema = z.object({
  prompt: z.string().min(3).max(2000),
  name: z.string().max(200).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "16:9", "9:16"]).optional(),
  style: z.string().max(100).optional(),
  model: z.string().max(40).optional(),
  parameters: z
    .object({
      aspectRatio: z
        .enum(["square_hd", "portrait_4_3", "landscape_16_9"])
        .optional(),
      style: z.string().max(200).optional(),
      seed: z.number().int().positive().optional(),
    })
    .default({}),
});

export const createJobSchema = z.object({
  campaignId: z.string().uuid(),
  type: z.enum([
    "image_generation",
    "image_variation",
    "upscale",
    "video_10s",
    "video_30s",
    "video_60s",
    "music_generation",
    "script_generation",
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const setAnchorSchema = z.object({
  assetId: z.string().uuid(),
});

export const createCompositionSchema = z.object({
  campaignId: z.string().uuid(),
  anchorAssetId: z.string().uuid(),
  format: z
    .enum(["square", "portrait", "landscape", "story", "reel"])
    .default("square"),
  textOverlays: z
    .array(
      z.object({
        text: z.string().max(500),
        position: z.enum(["top", "center", "bottom"]).default("bottom"),
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
  // Layered compositor document (lib/composition/layers.ts). Optional so the
  // legacy text-overlay path keeps working; compositor clients send these.
  background: backgroundSchema.optional(),
  layers: z.array(layerSchema).max(20).default([]),
});

// Cinema composition: layer existing assets (video + music + caption) into one
// MP4. Composes assets the workspace already owns — never generates — so it's
// always free and fully reversible (re-render with different layers anytime).
export const composeVideoSchema = z.object({
  campaignId: z.string().uuid(),
  caption: z.string().max(500).optional(),
  captionStyle: z
    .enum(["none", "fade", "lower_third", "crawl"])
    .default("fade"),
  useMusic: z.boolean().default(true),
  // Brand logo storage URL, baked into the film as an FFmpeg overlay layer.
  logoUrl: z.string().url().nullable().optional(),
});

export const publishSchema = z.object({
  compositionId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  platforms: z
    .array(
      z.enum([
        "instagram",
        "facebook",
        "twitter",
        "linkedin",
        "tiktok",
        "youtube",
        "pinterest",
        "reddit",
        "telegram",
        "threads",
        "snapchat",
        "bluesky",
        "gmb",
      ]),
    )
    .min(1),
  caption: z.string().max(2200),
  // Optional AI-tailored caption per platform; falls back to `caption`.
  platformCaptions: z.record(z.string(), z.string().max(5000)).optional(),
  hashtags: z.array(z.string()).max(30).default([]),
  scheduledAt: z.string().datetime().optional(),
  // Optional per-publish Facebook Page override (defaults to the active page).
  facebookPageId: z.string().optional(),
  // "Publish the video": resolve the campaign's video clip directly server-side.
  campaignId: z.string().optional(),
  preferVideo: z.boolean().optional(),
});

export const purchaseCreditsSchema = z.object({
  priceId: z.string().min(1),
});

export const createCommentSchema = z.object({
  body: z.string().min(1).max(2000),
  anchor: z
    .object({
      x: z.number().optional(), // image pin (0–1 normalized)
      y: z.number().optional(),
      t: z.number().optional(), // video timestamp (seconds)
    })
    .optional(),
});

export const brandVoiceSchema = z.object({
  samples: z.array(z.string().min(1).max(4000)).min(1).max(8),
});

export const suggestCommentSchema = z.object({
  platform: z.string().max(50).optional(),
  tone: z.enum(["professional", "casual", "playful"]).optional(),
  maxWords: z.number().int().positive().max(200).optional(),
  direction: z.string().max(500).optional(),
  context: z.string().max(1000).optional(),
});
