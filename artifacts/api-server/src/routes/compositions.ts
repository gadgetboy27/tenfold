import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../middlewares/auth.js";
import { deductCredits } from "./credits.js";

const router = Router();

interface TextOverlay {
  content: string;
  size: "S" | "M" | "L";
  position: "top" | "centre" | "bottom";
  colour: string;
}

interface Composition {
  id: string;
  campaignId: string;
  workspaceSlug: string;
  status: "processing" | "ready" | "failed";
  outputUrl: string | null;
  format: string;
  caption: string;
  hashtags: string[];
  textOverlays: TextOverlay[];
  brandLogo: boolean;
  brandColours: boolean;
  includeVideo: boolean;
  includeMusic: boolean;
  includeScript: boolean;
  createdAt: string;
}

const compositions = new Map<string, Composition>();

const COMPOSITION_COST = 2;

/**
 * POST /api/compositions
 * Composites the final image with overlays, brand kit, and text.
 *
 * TODO (real implementation using Sharp):
 *   import sharp from "sharp";
 *   // 1. Download anchor image: const imgBuffer = await fetch(anchorUrl).then(r => r.arrayBuffer())
 *   // 2. Build SVG overlay for text layers
 *   // 3. Composite: sharp(imgBuffer).composite([{ input: svgBuffer, gravity: "south" }]).toBuffer()
 *   // 4. If brandLogo: fetch logo, resize, composite in corner
 *   // 5. Upload to object storage (Supabase Storage / S3 / Cloudflare R2)
 *   //    const { data } = await supabase.storage.from("compositions").upload(`${id}.jpg`, outputBuffer)
 *   // 6. Return public URL
 *
 * Sharp install: pnpm add sharp
 * Supabase Storage: supabase.storage.from("bucket").upload(path, buffer)
 */
router.post("/compositions", requireAuth, (req, res) => {
  const {
    campaignId,
    caption = "",
    hashtags = [],
    textOverlays = [],
    format = "square",
    brandLogo = false,
    brandColours = false,
    includeVideo = false,
    includeMusic = false,
    includeScript = true,
  } = req.body as {
    campaignId: string;
    caption?: string;
    hashtags?: string[];
    textOverlays?: TextOverlay[];
    format?: string;
    brandLogo?: boolean;
    brandColours?: boolean;
    includeVideo?: boolean;
    includeMusic?: boolean;
    includeScript?: boolean;
  };

  if (!campaignId) {
    res.status(400).json({ error: "campaignId is required" });
    return;
  }

  const ws = req.workspaceSlug!;
  if (!deductCredits(ws, COMPOSITION_COST)) {
    res.status(402).json({ error: "Insufficient credits", required: COMPOSITION_COST });
    return;
  }

  const compositionId = randomUUID();
  const composition: Composition = {
    id: compositionId,
    campaignId,
    workspaceSlug: ws,
    status: "processing",
    outputUrl: null,
    format,
    caption,
    hashtags,
    textOverlays,
    brandLogo,
    brandColours,
    includeVideo,
    includeMusic,
    includeScript,
    createdAt: new Date().toISOString(),
  };

  compositions.set(compositionId, composition);

  // Simulate Sharp processing delay (~2-3s in production)
  setTimeout(() => {
    composition.status = "ready";
    // TODO: replace with real composed image URL from object storage
    composition.outputUrl = `https://picsum.photos/seed/${compositionId}/1080/1080`;
  }, 2200);

  res.status(201).json({ compositionId, status: "processing" });
});

/**
 * GET /api/compositions/:id
 * Poll composition status.
 */
router.get("/compositions/:id", requireAuth, (req, res) => {
  const comp = compositions.get(req.params["id"]!);
  if (!comp || comp.workspaceSlug !== req.workspaceSlug) {
    res.status(404).json({ error: "Composition not found" });
    return;
  }
  res.json(comp);
});

export default router;
