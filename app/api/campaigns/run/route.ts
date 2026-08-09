import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { isEnabled } from "@/lib/flags";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits/balance";
import {
  quoteRun,
  buildStages,
  DEFAULT_RUN_OPTIONS,
  type RunOptions,
} from "@/lib/foreman/plan";
import { driveRun } from "@/lib/foreman/execute";
import { recordDecision } from "@/lib/learning/record";

/**
 * POST /api/campaigns/run — start (or quote) a foreman run.
 *
 * **Two-phase by design.** `confirm: false` returns an itemised quote and does
 * nothing else; `confirm: true` starts the run. A single click that silently
 * spends ~83 credits is a support ticket, and the itemisation matters as much
 * as the total — video is roughly 75% of a default run, and a user who can see
 * that can choose to turn it off rather than abandoning the product.
 *
 * The run deliberately stops before publishing (see lib/foreman/plan.ts).
 */

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  confirm: z.boolean().default(false),
  options: z
    .object({
      includeVideo: z.boolean().optional(),
      includeMusic: z.boolean().optional(),
      includeCaption: z.boolean().optional(),
      // 30s needs the two-segment render the foreman does not implement.
      videoDuration: z.union([z.literal(10), z.literal(15)]).optional(),
      variety: z.boolean().optional(),
    })
    .optional(),
});

const handler = withWorkspace(async (req, { db, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { campaignId, confirm } = parsed.data;
  const options: RunOptions = {
    ...DEFAULT_RUN_OPTIONS,
    ...parsed.data.options,
  };
  const quote = quoteRun(options);

  const { data: campData } = await db
    .from("campaigns")
    .select("id, prompt, name")
    .eq("id", campaignId)
    .maybeSingle();
  const campaign = campData as {
    id: string;
    prompt: string | null;
    name: string | null;
  } | null;
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const balance = await getBalance(session.workspaceId);

  // Phase 1: quote only. Nothing is created, nothing is charged.
  if (!confirm) {
    return NextResponse.json({
      quote,
      balance,
      affordable: balance >= quote.total,
      stages: buildStages(options),
    });
  }

  // Refuse up front rather than failing three stages in. A run that dies
  // mid-way leaves a half-built campaign and a confusing ledger.
  if (balance < quote.total) {
    return NextResponse.json(
      { error: "Insufficient credits", quote, balance },
      { status: 402 },
    );
  }

  // One live run per campaign — a second would race the first for the anchor.
  const { data: existing } = await db
    .from("campaign_runs")
    .select("id")
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "running"])
    .limit(1);
  if ((existing ?? []).length > 0) {
    return NextResponse.json(
      { error: "This project already has a run in progress" },
      { status: 409 },
    );
  }

  const { data: created, error } = await db
    .from("campaign_runs")
    .insert({
      campaign_id: campaignId,
      status: "running",
      stages: buildStages(options),
      credits_estimated: quote.total,
      created_by: session.userId,
    })
    .select("id, workspace_id, campaign_id, stages, credits_spent")
    .single();
  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Could not start the run" },
      { status: 500 },
    );
  }

  void recordDecision(db, session.workspaceId, "run_started", {
    estimated: quote.total,
    stageCount: quote.items.length,
    includeVideo: options.includeVideo,
    includeMusic: options.includeMusic,
    videoDuration: options.videoDuration,
  });

  // Kick the first stage. driveRun runs synchronous stages inline and stops at
  // the first async one; the fal webhook carries it from there. Not awaited —
  // the caller gets the run id immediately and polls, matching how every other
  // long job in this app behaves.
  const admin = createSupabaseAdminClient();
  void driveRun({
    admin,
    run: created as never,
    options,
    prompt: campaign.prompt ?? "",
    campaignName: campaign.name ?? "Campaign",
  });

  return NextResponse.json({ runId: created.id, quote }, { status: 201 });
});

/**
 * GET /api/campaigns/run?campaignId=… — the live state of a campaign's run.
 *
 * Drives the progress UI and, just as importantly, the handover: when a run
 * fails or is abandoned the client needs to know WHICH stage stopped so it can
 * drop the user into the manual flow at exactly that point rather than back at
 * the beginning. `stages` carries that directly.
 */
const getHandler = withWorkspace(async (req, { db }) => {
  const campaignId = new URL(req.url).searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }
  const { data } = await db
    .from("campaign_runs")
    .select(
      "id, status, current_stage, stages, credits_estimated, credits_spent, error",
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // No run is a normal state — the campaign was driven manually.
  return NextResponse.json({ run: data ?? null });
});

export async function GET(
  req: Request,
  ctx?: { params?: Promise<Record<string, never>> },
): Promise<Response> {
  if (!isEnabled("foreman")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return getHandler(req, ctx);
}

/**
 * Flag checked before the wrapper: `withWorkspace` authenticates first, so a
 * check inside it answers 401 to an anonymous caller and confirms the endpoint
 * exists. A dark-launched feature must be genuinely absent
 * (LOGO_PRODUCTION.md §1).
 */
export async function POST(
  req: Request,
  ctx?: { params?: Promise<Record<string, never>> },
): Promise<Response> {
  if (!isEnabled("foreman")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return handler(req, ctx);
}
