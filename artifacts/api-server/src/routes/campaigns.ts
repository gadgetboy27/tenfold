import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../middlewares/auth.js";
import { deductCredits } from "./credits.js";

const router = Router();

/** Campaign status */
type AssetStatus = "pending" | "generating" | "ready" | "failed";

interface Asset {
  id: string;
  url: string;
  status: AssetStatus;
  prompt: string;
  aspectRatio: string;
  style: string;
  createdAt: string;
}

interface Campaign {
  id: string;
  workspaceSlug: string;
  prompt: string;
  aspectRatio: string;
  style: string;
  status: "generating" | "ready" | "failed";
  anchorAssetId: string | null;
  assets: Asset[];
  createdAt: string;
}

/** In-memory store. TODO: Replace with DB (Drizzle + Postgres). */
const campaigns = new Map<string, Campaign>();

const GENERATE_COST = 18;

/**
 * POST /api/campaigns
 * Creates a campaign and kicks off image generation.
 *
 * TODO (real implementation — pick one):
 *   Option A — Replicate:
 *     import Replicate from "replicate";
 *     const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
 *     for each of 6 images:
 *       const output = await replicate.run("stability-ai/sdxl:...", { input: { prompt, ... } });
 *       asset.url = output[0]; asset.status = "ready";
 *
 *   Option B — fal.ai:
 *     import * as fal from "@fal-ai/serverless-client";
 *     fal.config({ credentials: process.env.FAL_KEY });
 *     const result = await fal.run("fal-ai/flux/schnell", { input: { prompt, image_size: ... } });
 *
 *   Option C — OpenAI DALL·E 3:
 *     import OpenAI from "openai";
 *     const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *     const img = await openai.images.generate({ model: "dall-e-3", prompt, n: 1, size: "1024x1024" });
 *
 * For async jobs: save job IDs and poll in GET /api/campaigns/:id
 */
router.post("/campaigns", requireAuth, (req, res) => {
  const { prompt, aspectRatio = "1:1", style = "Photorealistic" } = req.body as {
    prompt: string;
    aspectRatio?: string;
    style?: string;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const ws = req.workspaceSlug!;
  if (!deductCredits(ws, GENERATE_COST)) {
    res.status(402).json({ error: "Insufficient credits", required: GENERATE_COST });
    return;
  }

  const campaignId = randomUUID();

  // Create 6 pending assets
  const assets: Asset[] = Array.from({ length: 6 }, (_, i) => ({
    id: randomUUID(),
    url: "",
    status: "pending" as AssetStatus,
    prompt,
    aspectRatio,
    style,
    createdAt: new Date().toISOString(),
  }));

  const campaign: Campaign = {
    id: campaignId,
    workspaceSlug: ws,
    prompt,
    aspectRatio,
    style,
    status: "generating",
    anchorAssetId: null,
    assets,
    createdAt: new Date().toISOString(),
  };

  campaigns.set(campaignId, campaign);

  // Simulate progressive image completion (replace with real AI calls)
  assets.forEach((asset, i) => {
    setTimeout(() => {
      asset.status = "ready";
      // TODO: replace this URL with real AI-generated image URL
      asset.url = `https://picsum.photos/seed/${campaignId}-${i}/800/800`;
      const allReady = campaign.assets.every(a => a.status === "ready");
      if (allReady) campaign.status = "ready";
    }, 2000 + i * 600);
  });

  res.status(201).json({ campaignId, status: "generating", assets: campaign.assets });
});

/**
 * GET /api/campaigns/:id
 * Polls campaign + asset status. Frontend calls this every 2s.
 * Returns partial results as each asset completes.
 */
router.get("/campaigns/:id", requireAuth, (req, res) => {
  const campaign = campaigns.get(req.params["id"]!);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (campaign.workspaceSlug !== req.workspaceSlug) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(campaign);
});

/**
 * PATCH /api/campaigns/:id/anchor
 * Sets the anchor image for a campaign — locks in the creative direction.
 */
router.patch("/campaigns/:id/anchor", requireAuth, (req, res) => {
  const campaign = campaigns.get(req.params["id"]!);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const { anchorAssetId } = req.body as { anchorAssetId: string };
  if (!anchorAssetId) {
    res.status(400).json({ error: "anchorAssetId is required" });
    return;
  }
  const asset = campaign.assets.find(a => a.id === anchorAssetId);
  if (!asset) {
    res.status(404).json({ error: "Asset not found in this campaign" });
    return;
  }
  campaign.anchorAssetId = anchorAssetId;
  res.json({ campaignId: campaign.id, anchorAssetId });
});

export default router;
