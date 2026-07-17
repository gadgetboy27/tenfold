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
import { getEntitlements } from "@/lib/billing/entitlements";
import {
  IMAGE_STYLE_SUFFIXES,
  MUSIC_GENRE_PROMPTS,
  MUSIC_NATURAL_SUFFIX,
  VIDEO_DURATION_PROMPTS,
  VIDEO_STYLE_PROMPTS,
  type VideoStyle,
} from "@/lib/fal/prompts";
import { v4 as uuidv4 } from "uuid";

function buildFalInput(
  type: string,
  params: Record<string, unknown>,
  prompt: string,
) {
  if (type === "image_generation") {
    const styleSuffix = IMAGE_STYLE_SUFFIXES[params.style as string] ?? "";
    const fullPrompt = styleSuffix ? `${prompt}, ${styleSuffix}` : prompt;
    return {
      prompt: fullPrompt,
      image_size: (params.imageSize as string) ?? "square_hd",
      num_images: 1, // Ad-hoc single image. Initial campaigns use num_images: 4 (see campaigns/route.ts)
      seed: params.seed as number | undefined,
    };
  }
  if (
    type === "video_5s" ||
    type === "video_10s" ||
    type === "video_15s" ||
    type === "video_30s"
  ) {
    // Kling v3 seconds PER CALL, capped at 15. 5s/10s/15s are single calls; 30s
    // renders as 2× 15s segments (see the video_30s enqueue below), so its
    // per-segment duration is also 15.
    const durationMap: Record<string, number> = {
      video_5s: 5,
      video_10s: 10,
      video_15s: 15,
      video_30s: 15,
    };
    const style = (params.videoStyle as VideoStyle) ?? "Cinematic";
    const durationBrief = VIDEO_DURATION_PROMPTS[type];
    const styleBrief = VIDEO_STYLE_PROMPTS[style].prompt;
    const variationDir = (params.variationDirection as string) ?? "";
    const composedParts = [
      durationBrief,
      styleBrief,
      prompt,
      variationDir ? `with ${variationDir}` : "",
    ].filter(Boolean);
    const composedPrompt = composedParts.join(", ");
    return {
      image_url: params.imageUrl as string,
      prompt: composedPrompt,
      duration: durationMap[type],
      negative_prompt: VIDEO_STYLE_PROMPTS[style].negativePrompt,
    };
  }
  if (type === "music_generation") {
    const genre = (params.genre as string) ?? "Lo-fi Chill";
    const genrePrompt =
      MUSIC_GENRE_PROMPTS[genre] ?? MUSIC_GENRE_PROMPTS["Lo-fi Chill"];
    const variationDir = (params.variationDirection as string) ?? "";
    const base = variationDir
      ? `${genrePrompt}, but ${variationDir}`
      : genrePrompt;
    const finalPrompt = `${base}. ${MUSIC_NATURAL_SUFFIX}`;
    // Match the track length to the chosen video duration (stable-audio caps
    // around 47s, so clamp). Falls back to 30s when no video length is given.
    const requested = Number(params.durationSec);
    const seconds =
      Number.isFinite(requested) && requested > 0 ? requested : 30;
    return {
      prompt: finalPrompt,
      seconds_total: Math.min(seconds, 47),
      steps: 100,
    };
  }
  return params;
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createJobSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    if (!(body.type in CREDIT_COSTS)) {
      return NextResponse.json({ error: "Unknown job type" }, { status: 400 });
    }

    const ent = await getEntitlements(session.workspaceId);

    // Gate video durations by plan entitlement — before charging. Free gets no
    // video at all; 30s is Business/Agency.
    if (
      body.type === "video_5s" ||
      body.type === "video_10s" ||
      body.type === "video_15s" ||
      body.type === "video_30s"
    ) {
      const seconds = Number(body.type.replace(/\D/g, "")); // 5 | 10 | 15 | 30
      if (!ent.videoDurations.includes(seconds)) {
        return NextResponse.json(
          {
            error: ent.videoDurations.length
              ? `${seconds}-second video is a Pro feature — upgrade to generate it.`
              : "Video is available on paid plans — upgrade to generate it.",
            upgrade: true,
          },
          { status: 403 },
        );
      }
    }

    // Daily generation cap — checked BEFORE the debit, so a capped request
    // costs the user nothing. Credits are the real bound on a free workspace
    // (50 welcome credits buys ~4 image grids), so this only bites when credits
    // don't bound: promo grants and admin top-ups have put 500+ free credits on
    // payg workspaces, and a runaway loop could otherwise burn the lot.
    if (ent.dailyGenerationCap !== null) {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const { count } = await admin
        .from("creative_jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", session.workspaceId)
        .gte("created_at", since.toISOString());
      if ((count ?? 0) >= ent.dailyGenerationCap) {
        return NextResponse.json(
          {
            error: `Daily limit reached (${ent.dailyGenerationCap} generations). It resets at midnight UTC${ent.isPro ? "" : " — upgrade for a higher limit"}.`,
            upgrade: !ent.isPro,
          },
          { status: 429 },
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
      const segments: { index: number; requestId: string }[] = [];
      try {
        for (let i = 0; i < SEGMENTS; i++) {
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
          segments.push({ index: i, requestId: rid });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Submit failed";
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
      const attempts =
        chosen.id === stableAudio.id
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
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
