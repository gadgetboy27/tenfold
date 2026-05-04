import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

interface PublishRecord {
  id: string;
  compositionId: string;
  workspaceSlug: string;
  platforms: string[];
  caption: string;
  scheduledAt: string | null;
  status: "pending" | "publishing" | "published" | "failed";
  results: { platform: string; postId?: string; url?: string; error?: string }[];
  createdAt: string;
}

const publishRecords = new Map<string, PublishRecord>();

/**
 * POST /api/publish
 * Publishes the composed asset to selected social platforms via Ayrshare.
 *
 * TODO (Ayrshare):
 *   const res = await fetch("https://app.ayrshare.com/api/post", {
 *     method: "POST",
 *     headers: {
 *       Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
 *       "Content-Type": "application/json",
 *     },
 *     body: JSON.stringify({
 *       post: caption,
 *       platforms,                              // ["instagram", "linkedin", ...]
 *       mediaUrls: [compositionOutputUrl],      // from GET /api/compositions/:id
 *       scheduleDate: scheduledAt ?? undefined, // ISO string if scheduled
 *     }),
 *   });
 *   const data = await res.json();
 *   // data.postIds contains per-platform post IDs
 *
 * For video posts: include videoUrls instead of mediaUrls
 * For multi-format: call Ayrshare once per platform with platform-specific params
 */
router.post("/publish", requireAuth, (req, res) => {
  const {
    compositionId,
    platforms,
    caption,
    scheduledAt = null,
  } = req.body as {
    compositionId: string;
    platforms: string[];
    caption: string;
    scheduledAt?: string | null;
  };

  if (!compositionId || !platforms?.length) {
    res.status(400).json({ error: "compositionId and platforms are required" });
    return;
  }

  const recordId = randomUUID();
  const record: PublishRecord = {
    id: recordId,
    compositionId,
    workspaceSlug: req.workspaceSlug!,
    platforms,
    caption,
    scheduledAt,
    status: "publishing",
    results: platforms.map(p => ({ platform: p })),
    createdAt: new Date().toISOString(),
  };

  publishRecords.set(recordId, record);

  const apiKey = process.env["AYRSHARE_API_KEY"];

  if (apiKey) {
    // TODO: real Ayrshare call here (see comment above)
    // For now fall through to simulation
  }

  // Simulate publish delay (~1.5s per platform in production)
  setTimeout(() => {
    record.status = "published";
    record.results = platforms.map(p => ({
      platform: p,
      postId: randomUUID(),
      url: `https://${p}.com/p/tenfold-${Date.now()}`,
    }));
  }, 2000);

  res.status(201).json({ recordId, status: "publishing", platforms });
});

/**
 * GET /api/publish/:id
 * Poll publish job status.
 */
router.get("/publish/:id", requireAuth, (req, res) => {
  const record = publishRecords.get(req.params["id"]!);
  if (!record || record.workspaceSlug !== req.workspaceSlug) {
    res.status(404).json({ error: "Publish record not found" });
    return;
  }
  res.json(record);
});

/**
 * GET /api/publish/history
 * Returns last N publish records for the workspace.
 */
router.get("/publish/history", requireAuth, (req, res) => {
  const ws = req.workspaceSlug!;
  const history = [...publishRecords.values()]
    .filter(r => r.workspaceSlug === ws)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  res.json({ history });
});

export default router;
