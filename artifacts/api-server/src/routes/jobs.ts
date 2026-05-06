import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth, debitCredits } from "../middlewares/auth.js";
import { db } from "@workspace/db";
import { creativeJobs } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fal } from "@fal-ai/client";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger.js";

const router = Router();

type JobType =
  | "video_10s"
  | "video_30s"
  | "video_60s"
  | "music_generation"
  | "script_generation"
  | "image_variation"
  | "upscale";

const CREDIT_COSTS: Record<JobType, number> = {
  video_10s: 15,
  video_30s: 40,
  video_60s: 80,
  music_generation: 8,
  script_generation: 1,
  image_variation: 3,
  upscale: 2,
};

const FAL_MODELS: Record<string, string> = {
  video_10s: "fal-ai/kling-video/v1.6/pro/image-to-video",
  video_30s: "fal-ai/kling-video/v1.6/pro/image-to-video",
  video_60s: "fal-ai/kling-video/v1.6/pro/image-to-video",
  music_generation: "fal-ai/stable-audio",
  image_variation: "fal-ai/flux-pro/kontext",
  upscale: "fal-ai/clarity-upscaler",
};

function configureFal(): void {
  const key = process.env["FAL_API_KEY"];
  if (!key) throw new Error("FAL_API_KEY is not configured");
  fal.config({ credentials: key });
}

function getWebhookUrl(): string {
  const base =
    process.env["APP_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    (process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : "");
  return `${base}/api/webhooks/fal`;
}

function buildFalInput(
  type: JobType,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (type === "video_10s") {
    return {
      image_url: params["anchorUrl"] ?? params["imageUrl"],
      prompt: params["prompt"] ?? "",
      duration: "5",
      aspect_ratio: "16:9",
    };
  }
  if (type === "video_30s" || type === "video_60s") {
    return {
      image_url: params["anchorUrl"] ?? params["imageUrl"],
      prompt: params["prompt"] ?? "",
      duration: "10",
      aspect_ratio: "16:9",
    };
  }
  if (type === "music_generation") {
    return {
      prompt: params["mood"] ?? params["prompt"] ?? "uplifting background music",
      seconds_total: 30,
      steps: 100,
    };
  }
  if (type === "image_variation") {
    return {
      image_url: params["anchorUrl"] ?? params["imageUrl"],
      prompt: params["prompt"] ?? "",
    };
  }
  if (type === "upscale") {
    return { image_url: params["assetUrl"] ?? params["imageUrl"] };
  }
  return params;
}

/**
 * POST /api/jobs
 * Creates an async generation job (video, music, image variation, upscale).
 * Script generation is handled synchronously via Anthropic.
 */
router.post("/jobs", requireAuth, async (req, res) => {
  const {
    type,
    campaignId,
    ...params
  } = req.body as { type: JobType; campaignId: string } & Record<string, unknown>;

  if (!type || !campaignId) {
    res.status(400).json({ error: "type and campaignId are required" });
    return;
  }

  if (!(type in CREDIT_COSTS)) {
    res.status(400).json({ error: `Unknown job type: ${type}` });
    return;
  }

  const workspaceId = req.workspaceId!;
  const cost = CREDIT_COSTS[type];
  const jobId = randomUUID();

  // Debit credits first
  const debit = await debitCredits(workspaceId, jobId, type, cost);
  if (!debit.success) {
    res.status(402).json({ error: "Insufficient credits", required: cost });
    return;
  }

  try {
    // ── Script: synchronous Anthropic call ──────────────────────────────────
    if (type === "script_generation") {
      const key = process.env["ANTHROPIC_API_KEY"];
      if (!key) {
        res.status(501).json({ error: "ANTHROPIC_API_KEY not configured" });
        return;
      }

      const anthropic = new Anthropic({ apiKey: key });
      const platform = (params["platform"] as string) ?? "instagram";
      const tone = (params["tone"] as string) ?? "professional";
      const businessName = (params["businessName"] as string) ?? "";
      const imageDesc = (params["imageDescription"] as string) ?? "";

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `Write a ${tone} social media caption for ${platform}.
Business: ${businessName}
Image: ${imageDesc}
Max words: 50
Return only the caption text, no explanation.`,
          },
        ],
      });

      const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

      await db.insert(creativeJobs).values({
        id: jobId,
        campaignId,
        workspaceId,
        type,
        status: "completed",
        inputParams: params as Record<string, unknown>,
        creditsCharged: cost,
        completedAt: new Date(),
      });

      res.status(201).json({ jobId, status: "ready", creditCost: cost, result: text });
      return;
    }

    // ── Async fal.ai jobs ─────────────────────────────────────────────────
    const modelId = FAL_MODELS[type];
    if (!modelId) {
      res.status(400).json({ error: `No fal.ai model for type: ${type}` });
      return;
    }

    configureFal();
    const falInput = buildFalInput(type, params as Record<string, unknown>);
    const webhookUrl = getWebhookUrl();

    const result = await (fal.queue.submit as (
      model: string,
      opts: { input: unknown; webhookUrl: string },
    ) => Promise<{ request_id: string }>)(modelId, {
      input: falInput,
      webhookUrl,
    });

    await db.insert(creativeJobs).values({
      id: jobId,
      campaignId,
      workspaceId,
      type,
      status: "processing",
      falRequestId: result.request_id,
      inputParams: falInput as Record<string, unknown>,
      creditsCharged: cost,
    });

    logger.info({ jobId, type, falRequestId: result.request_id }, "Job queued");
    res.status(201).json({ jobId, status: "processing", creditCost: cost });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, jobId, type }, "Job creation failed");
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/jobs/:id
 * Polls a job for completion status and output.
 */
router.get("/jobs/:id", requireAuth, async (req, res) => {
  try {
    const job = await db.query.creativeJobs.findFirst({
      where: and(
        eq(creativeJobs.id, req.params["id"]!),
        eq(creativeJobs.workspaceId, req.workspaceId!),
      ),
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(job);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
});

export default router;
