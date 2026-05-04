import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

/**
 * All social routes use Ayrshare for multi-platform publishing.
 *
 * TODO — Ayrshare setup:
 *   1. Sign up at ayrshare.com and get your API key
 *   2. Set AYRSHARE_API_KEY in environment secrets
 *   3. Replace stub responses below with real Ayrshare API calls
 *
 * Ayrshare base URL: https://app.ayrshare.com/api
 * Docs: https://docs.ayrshare.com
 */

const AYRSHARE_BASE = "https://app.ayrshare.com/api";

// Mock connected profiles per workspace (TODO: store in DB)
const mockProfiles: Record<string, { platform: string; handle: string; connected: boolean }[]> = {};

function getProfiles(ws: string) {
  if (!mockProfiles[ws]) {
    // Default mock state — no platforms connected
    mockProfiles[ws] = [
      { platform: "instagram", handle: "", connected: false },
      { platform: "facebook", handle: "", connected: false },
      { platform: "linkedin", handle: "", connected: false },
      { platform: "tiktok", handle: "", connected: false },
      { platform: "youtube", handle: "", connected: false },
      { platform: "twitter", handle: "", connected: false },
      { platform: "pinterest", handle: "", connected: false },
      { platform: "reddit", handle: "", connected: false },
      { platform: "threads", handle: "", connected: false },
      { platform: "bluesky", handle: "", connected: false },
    ];
  }
  return mockProfiles[ws]!;
}

/**
 * GET /api/social/profiles
 * Returns connected social media accounts.
 *
 * TODO (Ayrshare):
 *   const res = await fetch(`${AYRSHARE_BASE}/user`, {
 *     headers: { Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}` }
 *   });
 *   const { activeSocialAccounts } = await res.json();
 *   // Map Ayrshare account list to our profile format
 */
router.get("/social/profiles", requireAuth, (req, res) => {
  const profiles = getProfiles(req.workspaceSlug!);
  res.json({ profiles });
});

/**
 * GET /api/social/connect
 * Returns the Ayrshare link URL for connecting a social account.
 *
 * TODO (Ayrshare):
 *   const res = await fetch(`${AYRSHARE_BASE}/link`, {
 *     method: "POST",
 *     headers: {
 *       Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
 *       "Content-Type": "application/json"
 *     },
 *     body: JSON.stringify({ title: "Tenfold Workspace" })
 *   });
 *   const { url } = await res.json();
 *   res.json({ url });
 */
router.get("/social/connect", requireAuth, (_req, res) => {
  const apiKey = process.env["AYRSHARE_API_KEY"];
  if (!apiKey) {
    // Return a helpful stub so the frontend doesn't break
    res.json({
      url: null,
      message: "Set AYRSHARE_API_KEY environment variable to enable social account linking",
    });
    return;
  }

  // TODO: call Ayrshare /link endpoint
  res.json({ url: `${AYRSHARE_BASE}/link/TODO` });
});

export default router;
