import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createJobSchema } from "@/lib/validation/schemas";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS, type CreditCostKey } from "@/lib/credits/costs";
import { enqueueJob, enqueueFirstOf } from "@/lib/fal/queue";
import { getMusicModel } from "@/lib/fal/models";
import { generateScript } from "@/lib/claude/script";
import { getWorkspaceBrandVoice } from "@/lib/claude/brand-voice";
import { generateJingleLyrics } from "@/lib/claude/jingle";
import { getEntitlements } from "@/lib/billing/entitlements";
import { prepareVideoStartImage } from "@/lib/composition/video-image";
import { MUSIC_GENRE_TAGS } from "@/lib/fal/prompts";
import { buildFalInput } from "@/lib/fal/build-input";
import { v4 as uuidv4 } from "uuid";
import { errorMessage } from "@/lib/api/error-message";

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createJobSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    if (!(body.type in CREDIT_COSTS)) {
      return NextResponse.json({ error: "Unknown job type" }, { status: 400 });
    }

    // Gate video durations by plan entitlement — before charging. 30s is Pro-only.
    if (
      body.type === "video_10s" ||
      body.type === "video_15s" ||
      body.type === "video_30s"
    ) {
      const ent = await getEntitlements(session.workspaceId);
      const seconds = Number(body.type.replace(/\D/g, "")); // 10 | 15 | 30
      if (!ent.videoDurations.includes(seconds)) {
        return NextResponse.json(
          {
            error: `${seconds}-second video is a Pro feature — upgrade to generate it.`,
            upgrade: true,
          },
          { status: 403 },
        );
      }
    }

    const jobId = uuidv4();
    const creditType = body.type as CreditCostKey;
    const cost = CREDIT_COSTS[creditType];

    const debit = await debitCredits(session.workspaceId, jobId, creditType);
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const prompt = (body.params.prompt as string) ?? "";

    // Kling caps the start image at 10 MB; FLUX Ultra anchors often exceed it,
    // causing an intermittent 422 file_too_large. Normalize to a safe JPEG here
    // so the stored input_params + every segment use the same in-bounds frame.
    if (
      body.type === "video_10s" ||
      body.type === "video_15s" ||
      body.type === "video_30s"
    ) {
      const src = body.params.imageUrl;
      if (typeof src === "string" && src) {
        body.params.imageUrl = await prepareVideoStartImage(
          src,
          session.workspaceId,
        );
      }
    }

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: body.campaignId,
      workspace_id: session.workspaceId,
      type: body.type,
      status: "queued",
      input_params: body.params,
      credits_charged: cost,
    });
    if (jobErr) throw new Error(jobErr.message);

    // Script generation is synchronous
    if (body.type === "script_generation") {
      try {
        const brandVoice = await getWorkspaceBrandVoice(session.workspaceId);
        const result = await generateScript({
          imageDescription: (body.params.imageDescription as string) ?? "",
          businessName: (body.params.businessName as string) ?? "",
          platform: (body.params.platform as string) ?? "instagram",
          tone:
            (body.params.tone as "professional" | "casual" | "playful") ??
            "professional",
          maxWords: (body.params.maxWords as number) ?? 50,
          variationDirection: (body.params.variationDirection as string) ?? "",
          brandVoice,
          captionModel: body.params.captionModel as string | undefined,
        });

        await admin
          .from("creative_jobs")
          .update({
            status: "completed",
            actual_cost_usd: result.actualCostUsd,
          })
          .eq("id", jobId);

        return NextResponse.json(
          { jobId, creditCost: cost, status: "ready", result: result.text },
          { status: 201 },
        );
      } catch (scriptErr) {
        const msg =
          scriptErr instanceof Error
            ? scriptErr.message
            : "Caption generation failed";
        await admin
          .from("creative_jobs")
          .update({ status: "failed", error_message: msg })
          .eq("id", jobId);
        await refundCredits(jobId);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    // Real 30s = two 15s Kling v3 segments, concatenated by the webhook once both
    // land (montage). Each segment is its own fal request tied to this one job via
    // ?j=<jobId>&seg=<i>; the webhook validates the segment requestIds, stores each
    // as a video_segment asset, then stitches. One debit already covered the job.
    if (body.type === "video_30s") {
      const SEGMENTS = 2;
      const base = buildFalInput("video_30s", body.params, prompt) as Record<
        string,
        unknown
      >;
      // Light per-segment prompt variation so the two shots feel intentional.
      const hints = [
        "opening moment, establishing the scene with energy",
        "continuation, building motion toward a strong finish",
      ];
      let segments: { index: number; requestId: string }[] = [];
      try {
        // Submit BOTH segments in parallel so fal starts rendering both a beat
        // sooner (they already render concurrently; this removes the serial
        // submit round-trips). Order preserved by index.
        segments = await Promise.all(
          Array.from({ length: SEGMENTS }, async (_, i) => {
            const segWebhook = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}&seg=${i}`;
            const segInput = {
              ...base,
              prompt: `${base.prompt as string}, ${hints[i]}`,
            };
            const { requestId: rid } = await enqueueJob(
              "video_30s",
              segInput,
              segWebhook,
            );
            return { index: i, requestId: rid };
          }),
        );
      } catch (e) {
        const msg = errorMessage(e, "Submit failed");
        await admin
          .from("creative_jobs")
          .update({ status: "failed", error_message: msg })
          .eq("id", jobId);
        await refundCredits(jobId);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      await admin
        .from("creative_jobs")
        .update({
          status: "processing",
          fal_request_id: segments[0].requestId,
          input_params: {
            ...body.params,
            segments,
            expected_segments: SEGMENTS,
          },
        })
        .eq("id", jobId);
      return NextResponse.json(
        { jobId, creditCost: cost, status: "processing", segments: SEGMENTS },
        { status: 201 },
      );
    }

    // All other types go through fal.ai async queue
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    const falInput = buildFalInput(body.type, body.params, prompt);

    let requestId: string;
    if (body.type === "music_generation") {
      // Per-model input + fallback: try the chosen music model, then fall back
      // to Stable Audio (different input schema, so each attempt carries its own).
      const chosen = getMusicModel(
        body.params.musicModel as string | undefined,
      );
      const stableAudio = getMusicModel("stable-audio");
      const musicPrompt = (falInput as { prompt?: string }).prompt ?? prompt;
      const inputFor = (endpoint: string): Record<string, unknown> =>
        endpoint.includes("lyria")
          ? { prompt: musicPrompt }
          : (falInput as Record<string, unknown>);
      const aceStepInput = async (): Promise<Record<string, unknown>> => {
        const genre = (body.params.genre as string) ?? "Lo-fi Chill";
        const requested = Number(body.params.durationSec);
        const seconds =
          Number.isFinite(requested) && requested > 0 ? requested : 30;
        let lyrics = (body.params.lyrics as string | undefined)?.trim() ?? "";
        if (!lyrics) {
          try {
            const brandVoice = await getWorkspaceBrandVoice(
              session.workspaceId,
            );
            lyrics = await generateJingleLyrics({
              topic: prompt,
              genre,
              brandVoice,
            });
          } catch {
            lyrics = ""; // ACE-Step with empty lyrics = instrumental (graceful)
          }
        }
        // ACE-Step wants lowercase comma-separated keyword tags, not the display
        // name — fall back to a slugged genre if it's not in the tags map.
        const baseTags = MUSIC_GENRE_TAGS[genre] ?? genre.toLowerCase();
        // variationDirection (the Studio "describe the vibe" prompt) already
        // flows into the non-vocals path via the composed prompt below — this
        // engine has its own {tags, lyrics, duration} schema instead, so it
        // needs its own append rather than reusing that composed string.
        const direction = (
          body.params.variationDirection as string | undefined
        )?.trim();
        const tags = direction ? `${baseTags}, ${direction}` : baseTags;
        return { tags, lyrics, duration: seconds };
      };
      // Vocals (ACE-Step): different schema — `tags` (genre) + `lyrics`. Use the
      // user's lyrics, or auto-write a short jingle so it actually sings. Always
      // falls back to Stable Audio (instrumental) if the vocals model won't take.
      const attempts = chosen.vocals
        ? [
            { endpoint: chosen.endpoint, input: await aceStepInput() },
            {
              endpoint: stableAudio.endpoint,
              input: inputFor(stableAudio.endpoint),
            },
          ]
        : chosen.id === stableAudio.id
          ? [{ endpoint: chosen.endpoint, input: inputFor(chosen.endpoint) }]
          : [
              { endpoint: chosen.endpoint, input: inputFor(chosen.endpoint) },
              {
                endpoint: stableAudio.endpoint,
                input: inputFor(stableAudio.endpoint),
              },
            ];
      ({ requestId } = await enqueueFirstOf(attempts, webhookUrl));
    } else {
      ({ requestId } = await enqueueJob(
        body.type as import("@/lib/fal/models").FalModelKey,
        falInput,
        webhookUrl,
      ));
    }

    await admin
      .from("creative_jobs")
      .update({ fal_request_id: requestId, status: "processing" })
      .eq("id", jobId);

    return NextResponse.json(
      { jobId, requestId, creditCost: cost, status: "processing" },
      { status: 201 },
    );
  } catch (err) {
    const msg = errorMessage(err, "Unknown error");
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
