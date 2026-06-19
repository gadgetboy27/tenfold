// Server-side orchestration for the talking-spokesperson pipeline. ONE
// `talking_video` job moves through three stages (script → voice → lip-sync)
// driven by stage-routed webhooks, mirroring the multi-request pattern in the
// main fal webhook but kept fully separate from it.
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refundCredits } from "@/lib/credits/refund";
import { recordJobCost } from "@/lib/costs/tracker";
import { enqueueWithFallback } from "./queue";
import { isSuccessStatus } from "./webhooks";
import {
  TTS_MODEL,
  LIPSYNC_MODEL,
  ttsInput,
  lipsyncInput,
  type TalkingResolution,
} from "./talking-video";
import { v4 as uuidv4 } from "uuid";

export interface TalkingJobParams {
  presenterImageUrl: string;
  presenterSource: string;
  voice: string;
  resolution: TalkingResolution;
  tone: string;
  targetSeconds: number;
  /** ISO 639-1 code for the spoken language (multi-language dubbing). */
  language: string;
  product: {
    name: string;
    description: string;
    features: string[];
    callToAction: string;
  };
  script: string;
  stage: "tts" | "lipsync";
  ttsRequestId?: string;
  ttsAudioUrl?: string;
  lipsyncRequestId?: string;
}

interface TalkingJob {
  id: string;
  campaign_id: string;
  workspace_id: string;
  type: string;
  status: string;
  credits_charged: number;
  input_params: TalkingJobParams;
  fal_request_id: string | null;
}

const stageWebhookUrl = (jobId: string, stage: "tts" | "lipsync") =>
  `${process.env.APP_URL}/api/webhooks/talking-video?j=${jobId}&stage=${stage}`;

/** Stage 1 → 2: enqueue the TTS job for a freshly-created talking_video row. */
export async function enqueueTtsStage(
  jobId: string,
  params: TalkingJobParams,
): Promise<string> {
  const { requestId } = await enqueueWithFallback(
    [TTS_MODEL],
    ttsInput({
      script: params.script,
      voice: params.voice,
      languageCode: params.language,
    }),
    stageWebhookUrl(jobId, "tts"),
  );
  const admin = createSupabaseAdminClient();
  await admin
    .from("creative_jobs")
    .update({
      fal_request_id: requestId,
      status: "processing",
      input_params: { ...params, ttsRequestId: requestId },
    })
    .eq("id", jobId);
  return requestId;
}

/** Webhook entry: advance the pipeline based on which stage just completed. */
export async function handleTalkingWebhook(args: {
  jobId: string | null;
  stage: string | null;
  requestId: string;
  raw: unknown;
}): Promise<void> {
  const { jobId, stage, requestId, raw } = args;
  if (!jobId) return;
  const admin = createSupabaseAdminClient();

  const { data: jobRow } = await admin
    .from("creative_jobs")
    .select(
      "id, campaign_id, workspace_id, type, status, credits_charged, input_params, fal_request_id",
    )
    .eq("id", jobId)
    .single();
  const job = jobRow as TalkingJob | null;
  if (!job || job.type !== "talking_video") return;
  if (["completed", "failed", "cancelled"].includes(job.status)) return;

  const params = job.input_params;
  // Verify the webhook is for the request we actually submitted for this stage.
  const expected =
    stage === "tts" ? params.ttsRequestId : params.lipsyncRequestId;
  if (expected && expected !== requestId) return;

  const p = raw as { status?: string; payload?: unknown; output?: unknown };
  const data = (p.payload ?? p.output ?? p) as {
    audio?: { url?: string };
    video?: { url?: string; content_type?: string };
  };

  if (!isSuccessStatus(p.status ?? "")) {
    await failTalking(job, `Talking video failed at the ${stage} stage`);
    return;
  }

  try {
    if (stage === "tts") {
      const audioUrl = data.audio?.url;
      if (!audioUrl) {
        await failTalking(job, "Voice generation returned no audio");
        return;
      }
      const { requestId: lipReq } = await enqueueWithFallback(
        [LIPSYNC_MODEL],
        lipsyncInput({
          presenterImageUrl: params.presenterImageUrl,
          audioUrl,
          resolution: params.resolution,
        }),
        stageWebhookUrl(job.id, "lipsync"),
      );
      await admin
        .from("creative_jobs")
        .update({
          fal_request_id: lipReq,
          input_params: {
            ...params,
            ttsAudioUrl: audioUrl,
            lipsyncRequestId: lipReq,
            stage: "lipsync",
          },
        })
        .eq("id", job.id);
      return;
    }

    if (stage === "lipsync") {
      const videoUrl = data.video?.url;
      if (!videoUrl) {
        await failTalking(job, "Lip-sync returned no video");
        return;
      }
      await storeTalkingAsset(job, videoUrl, data.video?.content_type);
      await admin
        .from("creative_jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      await admin
        .from("campaigns")
        .update({ status: "ready" })
        .eq("id", job.campaign_id)
        .in("status", ["generating", "expanding"]);
      await recordJobCost(job.id, job.type);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Pipeline error";
    await failTalking(job, msg);
  }
}

async function failTalking(job: TalkingJob, message: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("creative_jobs")
    .update({ status: "failed", error_message: message })
    .eq("id", job.id);
  await refundCredits(job.id);
}

async function storeTalkingAsset(
  job: TalkingJob,
  videoUrl: string,
  contentType?: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const assetId = uuidv4();
  const storagePath = `${job.workspace_id}/${job.campaign_id}/${assetId}.mp4`;
  let publicUrl = videoUrl;
  let storedPath: string | null = null;
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(90_000) });
    const buffer = await res.arrayBuffer();
    const { error: upErr } = await admin.storage
      .from("assets")
      .upload(storagePath, buffer, {
        contentType: contentType ?? "video/mp4",
      });
    if (!upErr) {
      const { data } = admin.storage.from("assets").getPublicUrl(storagePath);
      publicUrl = data.publicUrl;
      storedPath = storagePath;
    }
  } catch {
    // Fall back to the fal CDN URL — may expire but better than nothing.
  }
  await admin.from("assets").insert({
    id: assetId,
    campaign_id: job.campaign_id,
    workspace_id: job.workspace_id,
    job_id: job.id,
    type: "video",
    url: publicUrl,
    storage_path: storedPath ?? `fal/${assetId}.mp4`,
    metadata: { talking_video: true, voice: job.input_params.voice },
  });
}
