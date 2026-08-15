import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refundCredits } from "@/lib/credits/refund";
import { advanceRunForJob } from "@/lib/foreman/advance";

/**
 * The stalled-job sweeper — the money half of the "stuck forever" problem.
 *
 * fal jobs are async by design (CLAUDE.md §2): debit credits, insert the job,
 * enqueue, and wait for a webhook. Every terminal outcome runs through that
 * webhook, INCLUDING the refund. So when a webhook never arrives — fal drops
 * it, APP_URL is wrong, the service is redeploying as it fires — the job sits
 * in `processing` forever and **nothing ever gives the credits back**. No code
 * path other than this one closes that hole.
 *
 * The UI-side fix (see components/studio/CLAUDE.md) stops the user staring at
 * a spinner, but a user who is told "these credits were spent" still needs
 * someone to actually return them. That's this.
 *
 * Deliberately conservative: it is far worse to kill a live job and refund a
 * user who is about to receive their asset than to leave a dead job around for
 * another hour.
 */

/**
 * How long a job may sit un-terminal before we call it dead.
 *
 * The slowest legitimate job in the system is `video_30s` — two 15s Kling
 * segments submitted separately and concatenated by the webhook — and Studio's
 * own client-side patience for it is ~5 minutes. 45 minutes is roughly an order
 * of magnitude beyond any real render, which is the margin this wants: the cost
 * of sweeping too early (a refunded user whose asset then lands) is much higher
 * than the cost of sweeping late.
 */
export const STALL_MINUTES = 45;

/** Statuses that mean "still in flight". Anything else is already terminal. */
const IN_FLIGHT = ["queued", "processing"] as const;

export interface SweepResult {
  /** Jobs examined (in-flight and older than the threshold). */
  examined: number;
  /** Zero assets → marked failed and refunded. */
  refunded: number;
  /** Credits actually returned across those jobs. */
  creditsRefunded: number;
  /** Partial delivery → settled as completed, deliberately NOT refunded. */
  settledPartial: number;
  /** Jobs that errored during the sweep; left alone for the next run. */
  errored: number;
  details: {
    jobId: string;
    type: string;
    ageMinutes: number;
    outcome: "refunded" | "settled_partial" | "error";
    assets: number;
    credits: number;
  }[];
}

interface StalledJob {
  id: string;
  type: string;
  status: string;
  campaign_id: string;
  workspace_id: string;
  credits_charged: number;
  input_params: Record<string, unknown> | null;
  created_at: string;
}

export async function sweepStalledJobs(
  opts: { stallMinutes?: number; dryRun?: boolean } = {},
): Promise<SweepResult> {
  const stallMinutes = opts.stallMinutes ?? STALL_MINUTES;
  const dryRun = opts.dryRun ?? false;
  const admin = createSupabaseAdminClient();

  const cutoff = new Date(Date.now() - stallMinutes * 60_000).toISOString();

  const { data, error } = await admin
    .from("creative_jobs")
    .select(
      "id, type, status, campaign_id, workspace_id, credits_charged, input_params, created_at",
    )
    .in("status", IN_FLIGHT)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    // A bound, so one bad day can't turn into an unbounded write burst. The
    // remainder is picked up by the next run; the route logs when it's hit.
    .limit(200);

  const result: SweepResult = {
    examined: 0,
    refunded: 0,
    creditsRefunded: 0,
    settledPartial: 0,
    errored: 0,
    details: [],
  };

  if (error || !data) return result;

  const jobs = data as StalledJob[];
  result.examined = jobs.length;

  for (const job of jobs) {
    const ageMinutes = Math.round(
      (Date.now() - new Date(job.created_at).getTime()) / 60_000,
    );
    try {
      // Did anything actually land? A multi-request job (6 logo concepts, a
      // variety pack) can deliver some of its assets and then stall waiting on
      // the rest, and those assets are real and usable.
      const { count } = await admin
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("job_id", job.id);
      const assets = count ?? 0;

      if (dryRun) {
        result.details.push({
          jobId: job.id,
          type: job.type,
          ageMinutes,
          outcome: assets > 0 ? "settled_partial" : "refunded",
          assets,
          credits: assets > 0 ? 0 : (job.credits_charged ?? 0),
        });
        if (assets > 0) result.settledPartial++;
        else result.refunded++;
        continue;
      }

      if (assets > 0) {
        // Partial delivery. NOT refunded — this mirrors the webhook's own
        // partial-success rule (`finalizeMultiImage`: any image ≥ 1 completes
        // the job and charges for it). Diverging here would mean the same
        // half-delivered outcome costs a user nothing or everything depending
        // on whether a webhook happened to arrive, which is indefensible.
        await settleAsCompleted(job, assets, ageMinutes);
        result.settledPartial++;
        result.details.push({
          jobId: job.id,
          type: job.type,
          ageMinutes,
          outcome: "settled_partial",
          assets,
          credits: 0,
        });
        continue;
      }

      // Nothing delivered. Fail it and give the credits back.
      await failAndRefund(job, ageMinutes);
      const credits = job.credits_charged ?? 0;
      result.refunded++;
      result.creditsRefunded += credits;
      result.details.push({
        jobId: job.id,
        type: job.type,
        ageMinutes,
        outcome: "refunded",
        assets: 0,
        credits,
      });
    } catch {
      // One bad job must not abort the sweep — the rest still need settling,
      // and this one is picked up by the next run.
      result.errored++;
      result.details.push({
        jobId: job.id,
        type: job.type,
        ageMinutes,
        outcome: "error",
        assets: 0,
        credits: 0,
      });
    }
  }

  return result;
}

/**
 * The marker a swept job carries. The fal webhook checks this so a webhook
 * arriving after we've refunded doesn't re-complete the job and hand the user
 * both the asset and their credits back.
 *
 * It lives in `fal_raw_error` rather than a new `status` value on purpose: a
 * dozen client polls across Studio, the Pro panels and the Compositor branch on
 * `status === "failed"`, and a novel status would be silently unrecognised by
 * every one of them — the exact "spinner never resolves" bug this whole change
 * exists to remove.
 */
export const SWEPT_MARKER = "stalled_job_sweeper";

function sweptError(ageMinutes: number, note: string) {
  return {
    swept_by: SWEPT_MARKER,
    swept_at: new Date().toISOString(),
    age_minutes: ageMinutes,
    note,
  };
}

async function failAndRefund(job: StalledJob, ageMinutes: number) {
  const admin = createSupabaseAdminClient();

  // Guard on status so we never overwrite a job a webhook settled between our
  // SELECT and this UPDATE — that webhook's outcome is the true one.
  const { data: updated } = await admin
    .from("creative_jobs")
    .update({
      status: "failed",
      error_message: `No response from the renderer after ${ageMinutes} minutes — credits refunded automatically.`,
      fal_raw_error: sweptError(ageMinutes, "no assets delivered"),
    })
    .eq("id", job.id)
    .in("status", IN_FLIGHT)
    .select("id");

  // Lost the race — a webhook settled it first. Leave its outcome alone.
  if (!updated || updated.length === 0) return;

  // refund_credits (migration 0005) is atomic and idempotent: it locks the job
  // row and skips if a refund transaction already exists, so racing this
  // against a late webhook cannot double-refund.
  await refundCredits(job.id);

  // An image job that delivered nothing leaves its campaign with no assets —
  // same reasoning as the webhook's own failure path.
  if (job.type === "image_generation") {
    await admin
      .from("campaigns")
      .update({ status: "failed" })
      .eq("id", job.campaign_id)
      .in("status", ["generating", "expanding"]);
  }

  // If this job was driving a foreman run, that run is now waiting on a stage
  // that will never report. Tell it, or it hangs exactly as this job did.
  await advanceRunForJob({
    id: job.id,
    input_params: job.input_params ?? {},
    status: "failed",
  }).catch(() => {});
}

async function settleAsCompleted(
  job: StalledJob,
  assets: number,
  ageMinutes: number,
) {
  const admin = createSupabaseAdminClient();

  const { data: updated } = await admin
    .from("creative_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      error_message: `Delivered ${assets} asset(s) then stopped responding; settled after ${ageMinutes} minutes.`,
      fal_raw_error: sweptError(ageMinutes, `partial delivery: ${assets}`),
    })
    .eq("id", job.id)
    .in("status", IN_FLIGHT)
    .select("id");

  if (!updated || updated.length === 0) return;

  await admin
    .from("campaigns")
    .update({ status: "ready" })
    .eq("id", job.campaign_id)
    .in("status", ["generating", "expanding"]);

  // A run whose stage half-delivered can legitimately carry on — the anchor
  // step only needs one image. Reported as completed, matching the webhook.
  await advanceRunForJob({
    id: job.id,
    input_params: job.input_params ?? {},
    status: "completed",
  }).catch(() => {});
}
