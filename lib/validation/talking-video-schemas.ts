import { z } from "zod";

// Dedicated to the talking-spokesperson "product launch ad" flow. Kept separate
// from the core createJobSchema so this feature stays decoupled from the main
// /api/jobs pipeline. Every option here surfaces as a user-facing picker in the UI.
export const createTalkingVideoSchema = z.object({
  campaignId: z.string().uuid(),
  // Resolved by the UI from the chosen presenter source (upload / generate / stock)
  // to a single public image URL before submission.
  presenterImageUrl: z.string().url(),
  presenterSource: z.enum(["upload", "generate", "stock"]).default("upload"),
  // Voice id — validated loosely and resolved via getVoice(), which falls back to
  // the default if an unknown id slips through.
  voice: z.string().max(40).default("Rachel"),
  resolution: z.enum(["480p", "720p"]).default("480p"),
  tone: z.enum(["professional", "casual", "playful"]).default("professional"),
  // Clip length — bounds the script length and drives cost.
  targetSeconds: z.number().int().min(5).max(30).default(15),
  product: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(1500).default(""),
    features: z.array(z.string().max(200)).max(8).default([]),
    callToAction: z.string().max(200).default(""),
  }),
  // Optional: the user supplies their own spoken script, skipping Claude.
  scriptOverride: z.string().max(1200).optional(),
});

export type CreateTalkingVideoInput = z.infer<typeof createTalkingVideoSchema>;
