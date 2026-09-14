import { fal } from "@/lib/fal/client";
import { FAL_MODELS, type FalModelKey } from "@/lib/fal/models";
import {
  handleFailure,
  handleSuccess,
  type CreativeJob,
  type JobDirection,
  type ResultData,
} from "@/lib/fal/handle-result";
import { claimFalRequest, releaseFalRequest } from "@/lib/fal/result-fetcher";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Reclaim logo results whose webhook hasn't arrived.
 *
 * Measured 2026-09-15: fal accepts a logo request within a second of the job
 * row, and Recraft renders six concepts in parallel in 7–12s (inference ~5–10s
 * each, no queueing). Yet on 2026-09-08 the webhooks for the same call landed
 * 30–61s after submission, and on 2026-08-24 a concepts job sat "generating"
 * for 75 minutes before its six webhooks arrived together. The wait was never
 * the model or our submit — it was fal's webhook delivery, and the logo flow
 * had nothing but that webhook to learn a result existed until the 45-minute
 * sweeper gave up on it.
 *
 * Campaign images already poll fal directly from their GET route after 20s
 * (lib/fal/result-fetcher.ts), but that fetcher saves untagged .jpg rows under
 * the image_generation model, which the logo studio never sees. This does the
 * same job for logos by handing the fetched result to the webhook's own
 * handler, so a reclaimed concept is byte-for-byte what the webhook would
 * have saved — svg/webp extension, logo_project_id, logo_stage, the direction
 * prompt finalize needs — and trips the same completion gate.
 *
 * Race-safe against the webhook via the claim on webhook_logs(source,
 * event_id): whichever path claims a request first owns it, and a lost claim
 * is the expected outcome, not an error. finalizeMultiImage counts those same
 * rows as "arrived", so a reclaimed direction is accounted for identically.
 */

/** How old a processing job must be before we ask fal. Under this, the
 *  webhook is still the likely first responder and a status call is waste. */
export const RECLAIM_AFTER_MS = 8_000;

interface LogoJobRow {
  id: string;
  campaign_id: string;
  workspace_id: string;
  type: string;
  status: string;
  credits_charged: number;
  input_params: Record<string, unknown> | null;
  fal_request_id: string | null;
  fal_raw_error: { swept_by?: string } | null;
  created_at: string;
}

interface Outstanding {
  requestId: string;
  direction: JobDirection | null;
}

/** Returns true if any request was reclaimed (assets saved or job settled). */
export async function reclaimLogoJobs(
  admin: Admin,
  jobs: LogoJobRow[],
  now = Date.now(),
): Promise<boolean> {
  const due = jobs.filter(
    (j) =>
      j.type.startsWith("logo_") &&
      j.status === "processing" &&
      now - new Date(j.created_at).getTime() > RECLAIM_AFTER_MS,
  );
  if (due.length === 0) return false;

  let changed = false;
  for (const row of due) {
    const job: CreativeJob = {
      ...row,
      input_params: row.input_params ?? {},
    };
    for (const o of await outstandingRequests(admin, job)) {
      if (await reclaimOne(admin, job, o)) changed = true;
    }
  }
  return changed;
}

/** Every fal request of this job that nothing has delivered or claimed yet. */
async function outstandingRequests(
  admin: Admin,
  job: CreativeJob,
): Promise<Outstanding[]> {
  const directions =
    (job.input_params.directions as JobDirection[] | undefined) ?? [];
  const candidates: Outstanding[] =
    directions.length > 0
      ? directions
          .filter((d): d is JobDirection & { requestId: string } =>
            Boolean(d.requestId),
          )
          .map((d) => ({ requestId: d.requestId, direction: d }))
      : job.fal_request_id
        ? [{ requestId: job.fal_request_id, direction: null }]
        : [];
  if (candidates.length === 0) return [];

  const { data: seen } = await admin
    .from("webhook_logs")
    .select("event_id")
    .eq("source", "fal")
    .in(
      "event_id",
      candidates.map((c) => c.requestId),
    );
  const delivered = new Set(
    ((seen ?? []) as Array<{ event_id: string }>).map((r) => r.event_id),
  );
  return candidates.filter((c) => !delivered.has(c.requestId));
}

async function reclaimOne(
  admin: Admin,
  job: CreativeJob,
  { requestId, direction }: Outstanding,
): Promise<boolean> {
  // Status/result are addressed by app alias (fal-ai/recraft), which the fal
  // client derives from any endpoint under it — the versioned path is fine.
  const modelId = FAL_MODELS[job.type as FalModelKey] ?? "fal-ai/recraft";

  let finished = false;
  try {
    const status = await fal.queue.status(modelId, { requestId });
    finished = status.status === "COMPLETED";
  } catch {
    return false; // can't tell — leave it to the webhook or the next poll
  }
  if (!finished) return false;

  if (!(await claimFalRequest(admin, requestId))) return false;

  let result: { data: ResultData };
  try {
    result = (await fal.queue.result(modelId, { requestId })) as {
      data: ResultData;
    };
  } catch (err) {
    // fal reports a request that failed at the model as a COMPLETED status
    // whose result call answers with the failure's own HTTP code. That is a
    // real outcome and settles the job (refund via the failure path). Anything
    // without a status is our network, not their verdict — hand the claim
    // back so the webhook can still deliver.
    const e = err as { status?: number; body?: unknown; message?: string };
    if (typeof e.status !== "number") {
      await releaseFalRequest(admin, requestId);
      return false;
    }
    await handleFailure(
      job,
      failureMessage(e),
      e.body ?? { error: e.message ?? "fal request failed" },
    );
    return true;
  }

  try {
    await handleSuccess(job, result.data, direction);
    return true;
  } catch (err) {
    // Storing the asset failed (bucket rejected it, network). Same treatment
    // the webhook route gives an exception here: the job is marked failed
    // and refunded, rather than left processing with a claim nobody honours.
    await handleFailure(
      job,
      err instanceof Error ? err.message : "Could not store the result",
      null,
    );
    return true;
  }
}

function failureMessage(e: { body?: unknown; message?: string }): string {
  const detail = (e.body as { detail?: Array<{ msg?: unknown }> } | undefined)
    ?.detail;
  const msg = Array.isArray(detail) ? detail[0]?.msg : undefined;
  if (typeof msg === "string" && msg) return msg.slice(0, 400);
  return e.message ?? "Generation failed on fal.ai";
}
