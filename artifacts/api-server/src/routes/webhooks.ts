import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { webhookLogs, creativeJobs, assets, campaigns } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

interface FalVideo {
  url: string;
  content_type?: string;
}

interface FalAudio {
  url: string;
  content_type?: string;
}

interface FalWebhookPayload {
  request_id: string;
  status: "OK" | "ERROR";
  payload?: {
    images?: FalImage[];
    video?: FalVideo;
    audio_file?: FalAudio;
  };
  error?: string;
}

/**
 * POST /api/webhooks/fal
 * Receives async completion callbacks from fal.ai.
 * Stores assets, marks job completed, flips campaign to 'ready'.
 */
router.post("/webhooks/fal", async (req, res) => {
  const body = req.body as FalWebhookPayload;

  if (!body?.request_id) {
    res.status(400).json({ error: "Missing request_id" });
    return;
  }

  // Idempotency: log first — duplicate webhooks do nothing
  const logged = await db
    .insert(webhookLogs)
    .values({
      source: "fal",
      eventId: body.request_id,
      payload: body as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning();

  if (logged.length === 0) {
    res.json({ ok: true, duplicate: true });
    return;
  }

  const job = await db.query.creativeJobs.findFirst({
    where: eq(creativeJobs.falRequestId, body.request_id),
  });

  if (!job) {
    await db
      .update(webhookLogs)
      .set({ error: "Unknown job", processed: true })
      .where(eq(webhookLogs.eventId, body.request_id));
    logger.warn({ requestId: body.request_id }, "Webhook: unknown job");
    res.status(404).json({ error: "Unknown job" });
    return;
  }

  try {
    if (body.status === "OK" && body.payload) {
      const assetRows: Array<typeof assets.$inferInsert> = [];

      if (body.payload.images) {
        for (const img of body.payload.images) {
          assetRows.push({
            id: randomUUID(),
            campaignId: job.campaignId,
            workspaceId: job.workspaceId,
            jobId: job.id,
            type: "image",
            url: img.url,
            storagePath: img.url, // fal.ai CDN URL as storage path
            widthPx: img.width,
            heightPx: img.height,
          });
        }
      }

      if (body.payload.video) {
        assetRows.push({
          id: randomUUID(),
          campaignId: job.campaignId,
          workspaceId: job.workspaceId,
          jobId: job.id,
          type: "video",
          url: body.payload.video.url,
          storagePath: body.payload.video.url,
        });
      }

      if (body.payload.audio_file) {
        assetRows.push({
          id: randomUUID(),
          campaignId: job.campaignId,
          workspaceId: job.workspaceId,
          jobId: job.id,
          type: "audio",
          url: body.payload.audio_file.url,
          storagePath: body.payload.audio_file.url,
        });
      }

      if (assetRows.length > 0) {
        await db.insert(assets).values(assetRows);
      }

      await db
        .update(creativeJobs)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(creativeJobs.id, job.id));

      // Flip campaign to 'ready' after image generation completes
      if (job.type === "image_generation") {
        await db
          .update(campaigns)
          .set({ status: "ready", updatedAt: new Date() })
          .where(eq(campaigns.id, job.campaignId));
      }

      logger.info({ jobId: job.id, type: job.type, assets: assetRows.length }, "Webhook: job completed");
    } else {
      // Job failed — mark and log
      await db
        .update(creativeJobs)
        .set({ status: "failed", errorMessage: body.error ?? "fal.ai job failed", updatedAt: new Date() })
        .where(eq(creativeJobs.id, job.id));

      // Flip campaign to 'failed' if it was an image gen job
      if (job.type === "image_generation") {
        await db
          .update(campaigns)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(campaigns.id, job.campaignId));
      }

      logger.warn({ jobId: job.id, error: body.error }, "Webhook: job failed");
    }

    await db
      .update(webhookLogs)
      .set({ processed: true })
      .where(eq(webhookLogs.eventId, body.request_id));

    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, requestId: body.request_id }, "Webhook processing error");
    res.status(500).json({ error: msg });
  }
});

export default router;
