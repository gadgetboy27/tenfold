import { SCENE_CREDITS, buildScenePrompt, seriesCost } from "./scenes";

/**
 * Start a Series: one `image_variation` job PER SCENE.
 *
 * Per scene, not one shared job, on purpose. Each scene is then an ordinary
 * single-image job, so everything that already protects those protects this:
 * its own atomic debit, its own refund when it fails, the fal webhook, the
 * stuck-job sweep and cost tracking — with no change to any of them. A shared
 * multi-image job would have refunded nothing when only some scenes failed.
 *
 * Order per scene is the one every credit route uses: debit → insert the job
 * (refund if that fails) → enqueue (fail the job and refund if that fails).
 * Insufficient credits are caught for the WHOLE series before any job exists.
 */

export interface SeriesDb {
  from(table: "creative_jobs"): {
    insert(row: Record<string, unknown>): PromiseLike<{
      error: { message: string } | null;
    }>;
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): PromiseLike<unknown>;
    };
  };
}

export interface SeriesDeps {
  db: SeriesDb;
  workspaceId: string;
  campaignId: string;
  appUrl: string;
  getBalance(workspaceId: string): Promise<number>;
  /** Debit one scene's credits, keyed to its job. */
  debit(workspaceId: string, jobId: string): Promise<{ success: boolean }>;
  refund(jobId: string): Promise<unknown>;
  enqueue(
    input: Record<string, unknown>,
    webhookUrl: string,
  ): Promise<{ requestId: string }>;
  newId(): string;
}

export interface StartedScene {
  jobId: string;
  sceneIndex: number;
  scene: string;
}
export interface FailedScene {
  sceneIndex: number;
  scene: string;
  reason: string;
}

export type StartSeriesResult =
  | {
      ok: true;
      seriesId: string;
      started: StartedScene[];
      failed: FailedScene[];
      /** Credits actually kept — failed scenes were refunded. */
      charged: number;
    }
  | { ok: false; error: string; needed: number; balance: number };

export async function startSeries(
  deps: SeriesDeps,
  input: { subjectUrl: string; scenes: string[] },
): Promise<StartSeriesResult> {
  const needed = seriesCost(input.scenes.length);
  const balance = await deps.getBalance(deps.workspaceId);
  if (balance < needed) {
    return {
      ok: false,
      error: "Insufficient credits",
      needed,
      balance,
    };
  }

  const seriesId = deps.newId();

  const one = async (
    scene: string,
    sceneIndex: number,
  ): Promise<StartedScene | FailedScene> => {
    const fail = (reason: string): FailedScene => ({
      sceneIndex,
      scene,
      reason,
    });
    const jobId = deps.newId();

    const debit = await deps.debit(deps.workspaceId, jobId);
    if (!debit.success) return fail("Insufficient credits");

    // supabase-js returns { error } rather than throwing; an unchecked insert
    // would keep the debit with no job for the webhook to write to.
    const { error: jobErr } = await deps.db.from("creative_jobs").insert({
      id: jobId,
      campaign_id: deps.campaignId,
      workspace_id: deps.workspaceId,
      type: "image_variation",
      status: "queued",
      input_params: {
        seriesId,
        sceneIndex,
        seriesSize: input.scenes.length,
        scene,
        subjectUrl: input.subjectUrl,
      },
      credits_charged: SCENE_CREDITS,
    });
    if (jobErr) {
      await deps.refund(jobId);
      return fail("Could not start this scene — you were not charged for it.");
    }

    try {
      const { requestId } = await deps.enqueue(
        {
          image_url: input.subjectUrl,
          prompt: buildScenePrompt(scene),
          num_images: 1,
        },
        `${deps.appUrl}/api/webhooks/fal?j=${jobId}`,
      );
      await deps.db
        .from("creative_jobs")
        .update({ fal_request_id: requestId, status: "processing" })
        .eq("id", jobId);
      return { jobId, sceneIndex, scene };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Submit failed";
      await deps.db
        .from("creative_jobs")
        .update({ status: "failed", error_message: message })
        .eq("id", jobId);
      await deps.refund(jobId);
      return fail("The image service didn't accept this scene — refunded.");
    }
  };

  // Concurrent: each debit is atomic in the database, and the balance was
  // checked for the whole set above, so this only races if the balance moves
  // underneath us — in which case that one scene simply fails and is reported.
  const results = await Promise.all(input.scenes.map(one));

  const started = results.filter((r): r is StartedScene => "jobId" in r);
  const failed = results.filter((r): r is FailedScene => "reason" in r);
  return {
    ok: true,
    seriesId,
    started,
    failed,
    charged: started.length * SCENE_CREDITS,
  };
}
