import { SupabaseClient } from "@supabase/supabase-js";
import { analyzeTranscript } from "./stage1-analyse";
import { repurposeContent } from "./stage2-repurpose";
import { scheduleContent } from "./stage3-schedule";
import { generateThumbnailConcepts } from "./stage4-thumbnails";
import { publishToAyrshare } from "./stage5-publish";

interface PipelineRunnerContext {
  submissionId: string;
  workspaceId: string;
  userId: string;
  transcript: string;
  profileKey: string;
  db: SupabaseClient;
}

async function updateStageStatus(
  db: SupabaseClient,
  submissionId: string,
  stage: string,
  status: "pending" | "running" | "completed" | "failed",
  output?: unknown,
  error?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (output) {
    update.output_json = output;
  }

  if (error) {
    update.error = error;
  }

  await db
    .from("content_pipeline_results")
    .update(update)
    .eq("submission_id", submissionId)
    .eq("stage", stage);
}

export async function runContentPipeline(
  context: PipelineRunnerContext,
): Promise<void> {
  const { submissionId, workspaceId, userId, transcript, profileKey, db } =
    context;

  try {
    await db
      .from("content_submissions")
      .update({ status: "running" })
      .eq("id", submissionId);

    await updateStageStatus(db, submissionId, "analyse", "running");
    let analysisOutput;

    try {
      analysisOutput = await analyzeTranscript(transcript);
      await updateStageStatus(
        db,
        submissionId,
        "analyse",
        "completed",
        analysisOutput,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await updateStageStatus(db, submissionId, "analyse", "failed", null, msg);
      throw error;
    }

    const [repurposeResult, thumbnailsResult] = await Promise.allSettled([
      (async () => {
        await updateStageStatus(db, submissionId, "repurpose", "running");
        const output = await repurposeContent(analysisOutput, transcript);
        await updateStageStatus(
          db,
          submissionId,
          "repurpose",
          "completed",
          output,
        );
        return output;
      })(),
      (async () => {
        await updateStageStatus(db, submissionId, "thumbnails", "running");
        const output = await generateThumbnailConcepts(
          analysisOutput,
          submissionId,
        );
        await updateStageStatus(
          db,
          submissionId,
          "thumbnails",
          "completed",
          output,
        );
        return output;
      })(),
    ]);

    let repurposeOutput;
    if (repurposeResult.status === "fulfilled") {
      repurposeOutput = repurposeResult.value;
    } else {
      const msg =
        repurposeResult.reason instanceof Error
          ? repurposeResult.reason.message
          : "Unknown error";
      await updateStageStatus(
        db,
        submissionId,
        "repurpose",
        "failed",
        null,
        msg,
      );
      throw new Error(`Repurpose stage failed: ${msg}`);
    }

    if (thumbnailsResult.status === "rejected") {
      const msg =
        thumbnailsResult.reason instanceof Error
          ? thumbnailsResult.reason.message
          : "Unknown error";
      await updateStageStatus(
        db,
        submissionId,
        "thumbnails",
        "failed",
        null,
        msg,
      );
      console.error(`Thumbnails stage failed: ${msg}`);
    }

    await updateStageStatus(db, submissionId, "schedule", "running");
    const scheduleOutput = scheduleContent(repurposeOutput);
    await updateStageStatus(
      db,
      submissionId,
      "schedule",
      "completed",
      scheduleOutput,
    );

    await updateStageStatus(db, submissionId, "publish", "completed", {
      pending: true,
    });

    await db
      .from("content_submissions")
      .update({ status: "completed" })
      .eq("id", submissionId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await db
      .from("content_submissions")
      .update({ status: "failed" })
      .eq("id", submissionId);

    console.error(`Pipeline failed for submission ${submissionId}:`, msg);
  }
}
