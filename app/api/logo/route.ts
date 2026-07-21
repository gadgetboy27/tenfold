import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueJob } from "@/lib/fal/queue";
import { logoBriefSchema } from "@/lib/logo/brief";
import { composeLogoPrompt } from "@/lib/logo/promptComposer";
import { resolveBrandColors } from "@/lib/logo/brandColors";

// POST /api/logo — start a logo project: create it from the brief, debit
// logo_concepts, and fan out 6 concept generations.
//
// Recraft V4.1 text-to-vector has no num_images, so 6 concepts = 6 fal
// requests sharing one creative_jobs row via input_params.directions — the
// exact pattern the campaigns route and the webhook already use. Each request's
// SVG lands via the existing webhook (?j=jobId&d=index).

const CONCEPT_COUNT = 6;

// Six distinct aesthetic directions so the concept grid gives genuinely
// different looks to choose from — not six seed-variants of one prompt. Each is
// appended to the brief-composed prompt; the CHOSEN one is carried into finalize
// so the SVG deliverable matches the look that was picked.
const CONCEPT_STYLES = [
  "minimalist, flat, simple geometric shapes, generous negative space",
  "bold and modern, strong solid shapes, high contrast",
  "clean monoline line-art, single consistent stroke weight",
  "friendly and rounded, soft approachable shapes",
  "elegant and refined, premium balanced proportions",
  "dynamic and abstract, creative use of negative space",
];

/**
 * A per-workspace "Logos" holding campaign. creative_jobs and assets both
 * require a non-null campaign_id, so logo jobs hang off this one campaign — the
 * webhook then saves logo SVGs as assets with zero changes. Project-level state
 * lives in logo_projects; assets are tagged metadata.logoProjectId to filter.
 */
export async function ensureLogoCampaign(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string,
  userId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Logos")
    .limit(1)
    .maybeSingle();
  const found = (existing as { id: string } | null)?.id;
  if (found) return found;

  const id = uuidv4();
  const { error } = await admin.from("campaigns").insert({
    id,
    workspace_id: workspaceId,
    name: "Logos",
    prompt: "Logo Studio",
    status: "ready",
    created_by: userId,
  });
  if (error)
    throw new Error(`Could not create logo campaign: ${error.message}`);
  return id;
}

// GET /api/logo — list this workspace's logo projects (newest first) with a
// representative thumbnail, so the studio can offer "your logos" to re-open,
// re-edit and re-download. Tenant-scoped.
export async function GET(req: Request) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data: projects } = await admin
      .from("logo_projects")
      .select("id, brief, status, final_asset_id, anchor_asset_id, created_at")
      .eq("workspace_id", session.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    const rows = (projects ?? []) as Array<{
      id: string;
      brief: { businessName?: string } | null;
      status: string;
      final_asset_id: string | null;
      anchor_asset_id: string | null;
      created_at: string;
    }>;

    // One query resolves every thumbnail: prefer the finalized mark, else the
    // chosen anchor. Missing (still-generating) projects simply have no thumb.
    const thumbIds = rows
      .map((r) => r.final_asset_id ?? r.anchor_asset_id)
      .filter((id): id is string => !!id);
    const thumbById = new Map<string, string>();
    if (thumbIds.length > 0) {
      const { data: assets } = await admin
        .from("assets")
        .select("id, url")
        .eq("workspace_id", session.workspaceId)
        .in("id", thumbIds);
      for (const a of (assets ?? []) as Array<{ id: string; url: string }>) {
        thumbById.set(a.id, a.url);
      }
    }

    const list = rows.map((r) => ({
      id: r.id,
      businessName: r.brief?.businessName ?? "Untitled logo",
      status: r.status,
      thumbnailUrl:
        thumbById.get(r.final_asset_id ?? "") ??
        thumbById.get(r.anchor_asset_id ?? "") ??
        null,
      createdAt: r.created_at,
    }));

    return NextResponse.json({ projects: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const parsed = logoBriefSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid brief", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const brief = parsed.data;
    const admin = createSupabaseAdminClient();

    const projectId = uuidv4();
    const jobId = uuidv4();
    const cost = CREDIT_COSTS.logo_concepts;

    // Debit BEFORE any work (CLAUDE.md §1/§3). 402 on empty wallet.
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "logo_concepts",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const composed = composeLogoPrompt(brief);
    const { prompt, style } = composed;
    // "brand" colour direction resolves to the workspace brand-kit palette.
    const colors =
      brief.colorDirection === "brand"
        ? await resolveBrandColors(admin, session.workspaceId)
        : composed.colors;
    // A picked style engages Recraft V3 (the style-aware family); "auto" keeps
    // the fast V4.1 raster path. `style` is only a valid input on the V3 model.
    const conceptModel = style ? "logo_styled" : "logo_concepts";
    const falInput: Record<string, unknown> = {
      prompt,
      image_size: "square_hd",
      ...(colors ? { colors } : {}),
      ...(style ? { style } : {}),
    };

    // The project + the concepts job. The 6 concepts share this one job via
    // directions (each a fal request, saved by the webhook as it lands).
    const { error: projErr } = await admin.from("logo_projects").insert({
      id: projectId,
      workspace_id: session.workspaceId,
      created_by: session.userId,
      brief,
      status: "generating",
    });
    if (projErr) {
      await refundCredits(jobId);
      throw new Error(projErr.message);
    }

    const directions = Array.from({ length: CONCEPT_COUNT }, (_, i) => ({
      index: i,
      label: `Concept ${i + 1}`,
      // Each concept gets its own aesthetic direction so the six genuinely differ.
      prompt: `${prompt}, ${CONCEPT_STYLES[i % CONCEPT_STYLES.length]}`,
    }));

    const campaignId = await ensureLogoCampaign(
      admin,
      session.workspaceId,
      session.userId,
    );

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "logo_concepts",
      status: "queued",
      input_params: { logoProjectId: projectId, prompt, colors, directions },
      credits_charged: cost,
    });
    if (jobErr) {
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    type Submitted = { index: number; label: string; requestId: string };
    const results = await Promise.all(
      directions.map(async (d): Promise<Submitted | null> => {
        const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}&d=${d.index}`;
        try {
          const { requestId } = await enqueueJob(
            conceptModel,
            { ...falInput, prompt: d.prompt },
            webhookUrl,
          );
          return { index: d.index, label: d.label, requestId };
        } catch {
          return null; // partial success is fine — others may land
        }
      }),
    );
    const submitted = results.filter((r): r is Submitted => r !== null);

    if (submitted.length === 0) {
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: "No concept submitted" })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start logo generation" },
        { status: 500 },
      );
    }

    await admin
      .from("creative_jobs")
      .update({
        fal_request_id: submitted[0].requestId,
        status: "processing",
        input_params: {
          logoProjectId: projectId,
          prompt,
          colors,
          directions: submitted,
          // The webhook's completion gate waits for this many images before
          // marking the job done (finalizeMultiImage).
          expected_images: submitted.length,
        },
      })
      .eq("id", jobId);

    return NextResponse.json(
      { projectId, jobId, concepts: submitted.length, creditCost: cost },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
