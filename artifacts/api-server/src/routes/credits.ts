import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { db } from "@workspace/db";
import { creditAccounts } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/**
 * GET /api/credits/balance
 * Returns the current credit balance for the authenticated workspace.
 */
router.get("/credits/balance", requireAuth, async (req, res) => {
  try {
    const account = await db.query.creditAccounts.findFirst({
      where: eq(creditAccounts.workspaceId, req.workspaceId!),
    });

    res.json({
      balance: account?.cachedBalance ?? 0,
      workspaceId: req.workspaceId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/credits/purchase
 * Opens a Stripe Checkout session for purchasing credits.
 * Stripe integration is handled separately — set STRIPE_SECRET_KEY to enable.
 */
router.post("/credits/purchase", requireAuth, (req, res) => {
  res.status(501).json({
    error: "Stripe checkout not yet configured",
    message: "Set STRIPE_SECRET_KEY to enable credit purchases",
  });
});

export default router;
