import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getEntitlements } from "@/lib/billing/entitlements";
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL } from "@/lib/fal/models";

// GET /api/models — curated image models for the anchor step, marked with which
// are locked behind a paid tier for this workspace (proOnly upsell).
export const GET = withWorkspace(async (_req, { session }) => {
  const ent = await getEntitlements(session.workspaceId);
  const models = IMAGE_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    blurb: m.blurb,
    creditCost: m.creditCost,
    proOnly: m.proOnly,
    locked: m.proOnly && !ent.isPro,
  }));
  return NextResponse.json({
    models,
    default: DEFAULT_IMAGE_MODEL,
    isPro: ent.isPro,
  });
});
