import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth, debitCredits } from "../middlewares/auth.js";
import { db } from "@workspace/db";
import { compositions as compositionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

const COMPOSITION_COST = 2;

/**
 * POST /api/compositions
 * Saves composition metadata to DB. Actual image compositing (Sharp) can be
 * added later as a fal.ai or worker job.
 */
router.post("/compositions", requireAuth, async (req, res) => {
  const {
    campaignId,
    anchorAssetId,
    caption = "",
    hashtags = [],
    textOverlays = [],
    format = "square",
    brandLogo = false,
    brandColours = false,
  } = req.body as {
    campaignId: string;
    anchorAssetId: string;
    caption?: string;
    hashtags?: string[];
    textOverlays?: unknown[];
    format?: string;
    brandLogo?: boolean;
    brandColours?: boolean;
  };

  if (!campaignId || !anchorAssetId) {
    res.status(400).json({ error: "campaignId and anchorAssetId are required" });
    return;
  }

  const workspaceId = req.workspaceId!;
  const compositionId = randomUUID();

  const debit = await debitCredits(workspaceId, compositionId, "composition", COMPOSITION_COST);
  if (!debit.success) {
    res.status(402).json({ error: "Insufficient credits", required: COMPOSITION_COST });
    return;
  }

  try {
    const [comp] = await db
      .insert(compositionsTable)
      .values({
        id: compositionId,
        campaignId,
        workspaceId,
        anchorAssetId,
        format,
        textOverlays: textOverlays as Record<string, unknown>[],
        branding: { brandLogo, brandColours },
        caption,
        hashtags,
        status: "draft",
      })
      .returning();

    logger.info({ compositionId }, "Composition created");
    res.status(201).json({ compositionId: comp.id, status: comp.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/compositions/:id
 */
router.get("/compositions/:id", requireAuth, async (req, res) => {
  try {
    const comp = await db.query.compositions.findFirst({
      where: and(
        eq(compositionsTable.id, req.params["id"]!),
        eq(compositionsTable.workspaceId, req.workspaceId!),
      ),
    });

    if (!comp) {
      res.status(404).json({ error: "Composition not found" });
      return;
    }
    res.json(comp);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
});

export default router;
