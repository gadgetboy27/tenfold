import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { hasActiveAddon } from "@/lib/billing/addons";
import { canUseCompositing } from "@/lib/compositing/access";
import {
  fetchImageBuffer,
  storeCompositeAsset,
} from "@/lib/compositing/storage";
import {
  textureOverlay,
  gradientMerge,
  softGlow,
} from "@/lib/compositing/blend";

// POST /api/compositing/blend — mechanical Sharp blends. Synchronous, no fal,
// no credits. Returns the stored composite_step asset.
const blendSchema = z.object({
  campaignId: z.string().uuid(),
  op: z.enum(["textureOverlay", "gradientMerge", "softGlow"]),
  baseUrl: z.string().url(),
  overlayUrl: z.string().url().optional(),
  mode: z.enum(["overlay", "soft-light", "multiply"]).default("soft-light"),
  opacity: z.number().min(0).max(1).default(1),
  direction: z.enum(["horizontal", "vertical"]).default("horizontal"),
  sigma: z.number().min(0).max(100).default(12),
});

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = blendSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // Mechanical blends are free (no fal call, no credits) but still part of
    // the compositing module's paywall — Agency, or Business with the Blend
    // Package add-on.
    const ent = await getEntitlements(session.workspaceId);
    const hasBlendAddon =
      ent.tier === "business"
        ? await hasActiveAddon(session.workspaceId, "blend_package")
        : false;
    const access = canUseCompositing(
      ent.tier,
      "mechanical_blend",
      hasBlendAddon,
    );
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason, upgrade: true },
        { status: 403 },
      );
    }

    // Tenant guard — the campaign must belong to this workspace.
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id")
      .eq("id", body.campaignId)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.op !== "softGlow" && !body.overlayUrl) {
      return NextResponse.json(
        { error: "overlayUrl is required for this blend" },
        { status: 400 },
      );
    }

    const base = await fetchImageBuffer(body.baseUrl);
    const overlay = body.overlayUrl
      ? await fetchImageBuffer(body.overlayUrl)
      : null;

    let result: Buffer;
    if (body.op === "textureOverlay") {
      result = await textureOverlay(base, overlay!, body.mode, body.opacity);
    } else if (body.op === "gradientMerge") {
      result = await gradientMerge(base, overlay!, body.direction);
    } else {
      result = await softGlow(base, body.sigma);
    }

    const meta = await sharp(result).metadata();
    const stored = await storeCompositeAsset({
      workspaceId: session.workspaceId,
      campaignId: body.campaignId,
      buffer: result,
      widthPx: meta.width,
      heightPx: meta.height,
      admin,
      metadata: { op: body.op, mechanical: true, credits: 0 },
    });

    return NextResponse.json(
      { assetId: stored.assetId, url: stored.url, creditCost: 0 },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
