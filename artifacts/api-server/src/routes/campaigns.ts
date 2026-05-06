import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth, debitCredits } from "../middlewares/auth.js";
import { db } from "@workspace/db";
import { campaigns, creativeJobs, assets } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fal } from "@fal-ai/client";
import { logger } from "../lib/logger.js";

const router = Router();

const IMAGE_GEN_COST = 18;

const FAL_IMAGE_MODEL = "fal-ai/flux-pro/v1.1";

function aspectRatioToFalSize(ratio: string): string {
  switch (ratio) {
    case "1:1":  return "square_hd";
    case "4:5":  return "portrait_4_3";
    case "16:9": return "landscape_16_9";
    case "9:16": return "portrait_16_9";
    default:     return "square_hd";
  }
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

function configureFal(): void {
  const key = process.env["FAL_API_KEY"];
  if (!key) throw new Error("FAL_API_KEY is not configured");
  fal.config({ credentials: key });
}

/**
 * POST /api/campaigns
 * Creates a campaign, debits 18 credits, and enqueues an image generation job
 * with fal.ai. The fal.ai webhook will flip status to 'ready' on completion.
 */
router.post("/campaigns", requireAuth, async (req, res) => {
  const {
    prompt,
    aspectRatio = "1:1",
    style = "Photorealistic",
  } = req.body as { prompt?: string; aspectRatio?: string; style?: string };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const workspaceId = req.workspaceId!;
  const userId = req.userId!;
  const campaignId = randomUUID();
  const jobId = randomUUID();

  try {
    // 1. Create campaign row
    await db.insert(campaigns).values({
      id: campaignId,
      workspaceId,
      createdBy: userId,
      prompt,
      parameters: { aspectRatio, style },
      status: "generating",
    });

    // 2. Debit credits
    const debit = await debitCredits(workspaceId, jobId, "image_generation", IMAGE_GEN_COST);
    if (!debit.success) {
      await db.delete(campaigns).where(eq(campaigns.id, campaignId));
      res.status(402).json({ error: "Insufficient credits", required: IMAGE_GEN_COST });
      return;
    }

    // 3. Build fal input
    const falInput = {
      prompt,
      image_size: aspectRatioToFalSize(aspectRatio),
      num_images: 6,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      enable_safety_checker: true,
    };

    // 4. Enqueue with fal.ai
    configureFal();
    const webhookUrl = getWebhookUrl();
    const result = await (fal.queue.submit as (
      model: string,
      opts: { input: unknown; webhookUrl: string },
    ) => Promise<{ request_id: string }>)(FAL_IMAGE_MODEL, {
      input: falInput,
      webhookUrl,
    });

    // 5. Persist the job so the webhook can find it
    await db.insert(creativeJobs).values({
      id: jobId,
      campaignId,
      workspaceId,
      type: "image_generation",
      status: "processing",
      falRequestId: result.request_id,
      inputParams: falInput as Record<string, unknown>,
      creditsCharged: IMAGE_GEN_COST,
    });

    logger.info({ campaignId, falRequestId: result.request_id }, "Campaign queued");
    res.status(201).json({ id: campaignId, campaignId, status: "generating" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, campaignId }, "Campaign creation failed");
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/campaigns/:id
 * Returns campaign + assets. Frontend polls this until status === 'ready'.
 */
router.get("/campaigns/:id", requireAuth, async (req, res) => {
  try {
    const campaign = await db.query.campaigns.findFirst({
      where: and(
        eq(campaigns.id, req.params["id"]!),
        eq(campaigns.workspaceId, req.workspaceId!),
      ),
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const campaignAssets = await db
      .select()
      .from(assets)
      .where(eq(assets.campaignId, campaign.id));

    res.json({ ...campaign, assets: campaignAssets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /api/campaigns/:id/anchor
 * Locks in the anchor image for a campaign.
 */
router.patch("/campaigns/:id/anchor", requireAuth, async (req, res) => {
  const { anchorAssetId } = req.body as { anchorAssetId?: string };

  if (!anchorAssetId) {
    res.status(400).json({ error: "anchorAssetId is required" });
    return;
  }

  try {
    const [updated] = await db
      .update(campaigns)
      .set({ anchorAssetId, updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, req.params["id"]!),
          eq(campaigns.workspaceId, req.workspaceId!),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    res.json({ campaignId: updated.id, anchorAssetId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
});

export default router;
