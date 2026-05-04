import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

/**
 * In-memory credit store per workspace.
 * TODO: Replace with database — e.g. Drizzle query to `credits` table.
 *   SELECT balance, monthly_allocation, used_this_month FROM workspaces WHERE slug = ?
 */
const creditStore = new Map<string, { balance: number; allocation: number; used: number }>();

function getCredits(workspaceSlug: string) {
  if (!creditStore.has(workspaceSlug)) {
    creditStore.set(workspaceSlug, { balance: 500, allocation: 1000, used: 347 });
  }
  return creditStore.get(workspaceSlug)!;
}

/**
 * GET /api/credits/balance
 * Returns the current credit balance for the workspace.
 */
router.get("/credits/balance", requireAuth, (req, res) => {
  const ws = req.workspaceSlug!;
  const { balance, allocation, used } = getCredits(ws);
  res.json({ balance, monthlyAllocation: allocation, usedThisMonth: used });
});

/**
 * POST /api/credits/purchase
 * Opens a Stripe Checkout session.
 *
 * TODO: Replace with Stripe integration:
 *   import Stripe from "stripe";
 *   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
 *   const session = await stripe.checkout.sessions.create({ ... });
 *   res.json({ checkoutUrl: session.url });
 */
router.post("/credits/purchase", requireAuth, (req, res) => {
  const { credits = 500 } = req.body as { credits?: number };
  // TODO: create real Stripe checkout session
  res.json({
    checkoutUrl: `https://buy.stripe.com/TODO?credits=${credits}`,
    message: "Connect Stripe: set STRIPE_SECRET_KEY and implement this route",
  });
});

/**
 * Internal helper — deduct credits. Call this from other routes.
 */
export function deductCredits(workspaceSlug: string, amount: number): boolean {
  const store = getCredits(workspaceSlug);
  if (store.balance < amount) return false;
  store.balance -= amount;
  store.used += amount;
  return true;
}

export default router;
