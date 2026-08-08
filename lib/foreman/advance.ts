import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { patchStage, driveRun, type RunRow } from "./execute";
import { DEFAULT_RUN_OPTIONS, type RunOptions, type RunStage } from "./plan";

/**
 * Called by the fal webhook when a job finishes. If that job belonged to a run,
 * mark its stage done and start the next one.
 *
 * Written to be the safest possible addition to the most load-bearing route in
 * the app. The webhook processes every generation for every user, so this:
 *
 *  - returns immediately unless `input_params.runId` is present (i.e. for all
 *    existing traffic it is a property read and nothing else),
 *  - is additionally gated on FEATURE_FOREMAN,
 *  - never throws — a foreman problem must not stop the webhook saving assets
 *    or marking the job complete, which is its actual job.
 *
 * The caller must therefore treat this as fire-and-forget.
 */
export async function advanceRunForJob(job: {
  id: string;
  input_params?: Record<string, unknown> | null;
  status?: string;
}): Promise<void> {
  const runId = job.input_params?.runId;
  const runStage = job.input_params?.runStage as RunStage | undefined;
  if (typeof runId !== "string" || !runStage) return;
  if (!isEnabled("foreman")) return;

  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("campaign_runs")
      .select("id, workspace_id, campaign_id, stages, credits_spent, status")
      .eq("id", runId)
      .maybeSingle();
    const run = data as (RunRow & { status: string }) | null;
    // A cancelled or already-failed run must not be resurrected by a late
    // webhook — fal can deliver after a user has abandoned the run.
    if (!run || (run.status !== "running" && run.status !== "queued")) return;

    const failed = job.status === "failed";
    const stages = patchStage(run.stages, runStage, {
      status: failed ? "failed" : "completed",
      endedAt: new Date().toISOString(),
      ...(failed ? { error: "Generation failed" } : {}),
    });

    if (failed) {
      // Stop the run rather than pressing on: later stages depend on this
      // output (video needs the anchor, music is sized to the video), so
      // continuing would spend credits producing something incoherent.
      await admin
        .from("campaign_runs")
        .update({
          stages,
          status: "failed",
          current_stage: null,
          error: `${runStage} failed`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return;
    }

    await admin
      .from("campaign_runs")
      .update({ stages, updated_at: new Date().toISOString() })
      .eq("id", runId);

    const { data: campData } = await admin
      .from("campaigns")
      .select("prompt, name, anchor_asset_id")
      .eq("id", run.campaign_id)
      .maybeSingle();
    const camp = campData as {
      prompt: string | null;
      name: string | null;
      anchor_asset_id: string | null;
    } | null;

    let anchorUrl: string | null = null;
    if (camp?.anchor_asset_id) {
      const { data: a } = await admin
        .from("assets")
        .select("url")
        .eq("id", camp.anchor_asset_id)
        .maybeSingle();
      anchorUrl = (a as { url: string } | null)?.url ?? null;
    }

    // Options aren't persisted separately — the stage log already encodes what
    // was planned, and the durations that matter are re-derived here.
    const options: RunOptions = { ...DEFAULT_RUN_OPTIONS };

    await driveRun({
      admin,
      run: { ...run, stages },
      options,
      prompt: camp?.prompt ?? "",
      campaignName: camp?.name ?? "Campaign",
      anchorImageUrl: anchorUrl,
    });
  } catch {
    // Deliberately swallowed: the webhook's contract is to record the job.
    // A broken run is recoverable; a webhook that 500s loses the asset.
  }
}
