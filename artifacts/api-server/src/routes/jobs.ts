import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../middlewares/auth.js";
import { deductCredits } from "./credits.js";

const router = Router();

type JobType = "video" | "music" | "script" | "image_variation" | "upscale";
type JobStatus = "pending" | "generating" | "ready" | "failed";

interface Job {
  id: string;
  type: JobType;
  campaignId: string;
  workspaceSlug: string;
  status: JobStatus;
  outputUrl: string | null;
  outputText: string | null;
  creditCost: number;
  params: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

const jobs = new Map<string, Job>();

const CREDIT_COSTS: Record<JobType, number> = {
  video: 15,        // up to 80 for longer clips
  music: 8,
  script: 1,
  image_variation: 3,
  upscale: 2,
};

/**
 * POST /api/jobs
 * Creates an async generation job (video, music, script, variation, upscale).
 *
 * TODO — real implementations:
 *
 * VIDEO (Runway Gen-3 / Kling / Sora):
 *   import RunwayML from "@runwayml/sdk";
 *   const client = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });
 *   const task = await client.imageToVideo.create({ model: "gen3a_turbo", promptImage: anchorUrl, duration });
 *   // Poll task.id for completion, store output URL
 *
 * MUSIC (Suno API / Udio):
 *   POST https://studio-api.suno.ai/api/generate with prompt derived from anchor description
 *   // Returns clip_id, poll for audio URL
 *
 * SCRIPT (Claude / GPT-4o):
 *   import Anthropic from "@anthropic-ai/sdk";
 *   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 *   const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 512,
 *     messages: [{ role: "user", content: `Write a ${tone} ${platform} caption for: ${anchorPrompt}` }]
 *   });
 *   job.outputText = msg.content[0].text;
 *
 * IMAGE VARIATION (Replicate / fal.ai img2img):
 *   const output = await replicate.run("stability-ai/sdxl:...", { input: { image: anchorUrl, prompt, strength: 0.7 } });
 *
 * UPSCALE (Real-ESRGAN via Replicate):
 *   const output = await replicate.run("nightmareai/real-esrgan:...", { input: { image: assetUrl, scale: 2 } });
 */
router.post("/jobs", requireAuth, (req, res) => {
  const {
    type,
    campaignId,
    anchorAssetId,
    assetId,
    duration,
    mood,
    platform,
    tone,
  } = req.body as {
    type: JobType;
    campaignId: string;
    anchorAssetId?: string;
    assetId?: string;
    duration?: number;
    mood?: string;
    platform?: string;
    tone?: string;
  };

  if (!type || !campaignId) {
    res.status(400).json({ error: "type and campaignId are required" });
    return;
  }

  const ws = req.workspaceSlug!;
  let cost = CREDIT_COSTS[type];

  // Video cost scales with duration
  if (type === "video" && duration) {
    cost = duration <= 10 ? 15 : duration <= 30 ? 35 : 80;
  }

  if (!deductCredits(ws, cost)) {
    res.status(402).json({ error: "Insufficient credits", required: cost });
    return;
  }

  const jobId = randomUUID();
  const job: Job = {
    id: jobId,
    type,
    campaignId,
    workspaceSlug: ws,
    status: "generating",
    outputUrl: null,
    outputText: null,
    creditCost: cost,
    params: { anchorAssetId, assetId, duration, mood, platform, tone },
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  jobs.set(jobId, job);

  // Simulate completion delay (replace with real async job processing)
  const delay = type === "script" ? 800 : type === "music" ? 4000 : type === "video" ? 8000 : 2500;
  setTimeout(() => {
    job.status = "ready";
    job.completedAt = new Date().toISOString();

    // TODO: set real output from AI service
    if (type === "script") {
      job.outputText = `Ready to level up? This content was built to inspire — and it shows. Whether you're building a brand or scaling a vision, every frame tells your story. #${platform || "content"} #creative #tenfold`;
    } else if (type === "music") {
      job.outputUrl = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`; // placeholder
    } else {
      job.outputUrl = `https://picsum.photos/seed/${jobId}/800/800`;
    }
  }, delay);

  res.status(201).json({ jobId, status: "generating", creditCost: cost });
});

/**
 * GET /api/jobs/:id
 * Poll a specific job for completion.
 */
router.get("/jobs/:id", requireAuth, (req, res) => {
  const job = jobs.get(req.params["id"]!);
  if (!job || job.workspaceSlug !== req.workspaceSlug) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

export default router;
