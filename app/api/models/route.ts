import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getEntitlements } from "@/lib/billing/entitlements";
import {
  IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL,
  VARIETY_IMAGE_MODELS,
} from "@/lib/fal/models";

// GET /api/models — curated image models for the anchor step, marked with which
// are locked behind a paid tier for this workspace (proOnly upsell). Also returns
// the variety-pack models with a GLOBAL pick count (crowd popularity signal) so
// the client can show which look users keep choosing.
export const GET = withWorkspace(async (_req, { session, admin }) => {
  const ent = await getEntitlements(session.workspaceId);
  const models = IMAGE_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    blurb: m.blurb,
    creditCost: m.creditCost,
    proOnly: m.proOnly,
    locked: m.proOnly && !ent.isPro,
  }));

  // Global pick tally per model (best-effort — never block the picker on it).
  const picksByModel = new Map<string, number>();
  try {
    const { data } = await admin.rpc("variety_model_popularity");
    for (const row of (data ?? []) as { model: string; picks: number }[]) {
      picksByModel.set(row.model, Number(row.picks) || 0);
    }
  } catch {
    // popularity is a nice-to-have; ignore failures
  }
  const varietyModels = VARIETY_IMAGE_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    picks: picksByModel.get(m.id) ?? 0,
  }));

  return NextResponse.json({
    models,
    default: DEFAULT_IMAGE_MODEL,
    isPro: ent.isPro,
    varietyModels,
  });
});
