import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getEntitlements } from "@/lib/billing/entitlements";
import { validatePrompt } from "@/lib/fal/prompt-validator";
import { getImageModel, imageFallbackEndpoints } from "@/lib/fal/models";
import { enqueueWithFallback } from "@/lib/fal/queue";
import { debitCreditsAmount } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";

const ASPECT_TO_IMAGE_SIZE: Record<string, string> = {
  "1:1": "square_hd",
  "4:5": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

const STYLE_SUFFIXES: Record<string, string> = {
  Photorealistic:
    "RAW photo, photorealistic, ultra-detailed, 8K UHD, DSLR camera, sharp focus, professional studio lighting",
  Illustration:
    "digital illustration, vector art style, clean bold lines, vibrant flat colours, ArtStation quality",
  Cinematic:
    "cinematic movie still, anamorphic widescreen lens, dramatic lighting, film grain, Hollywood colour grade",
  "3D": "3D render, Octane render, volumetric lighting, ray tracing, photorealistic PBR materials, 8K",
};

// POST /api/campaigns/:id/regenerate — generate a fresh batch of anchor
// directions into an EXISTING campaign. Costs the chosen model's credits
// (a deliberate new generation, distinct from reusing existing images).
export const POST = withWorkspace<{ id: string }>(
  async (_req, { db, admin, session, params }) => {
    const { data: campaign } = await db
      .from("campaigns")
      .select("id, prompt, parameters")
      .eq("id", params.id)
      .single();
    const c = campaign as {
      prompt: string;
      parameters: {
        style?: string;
        aspectRatio?: string;
        model?: string;
      } | null;
    } | null;
    if (!c)
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );

    const style = c.parameters?.style ?? "Photorealistic";
    const ent = await getEntitlements(session.workspaceId);
    const imageModel = getImageModel(c.parameters?.model);
    if (imageModel.proOnly && !ent.isPro) {
      return NextResponse.json(
        { error: `${imageModel.label} is a Pro model.`, upgrade: true },
        { status: 403 },
      );
    }

    const validation = await validatePrompt(c.prompt, style, ent.maxVariations);
    const imageSize =
      ASPECT_TO_IMAGE_SIZE[c.parameters?.aspectRatio ?? "1:1"] ?? "square_hd";
    const styleSuffix = STYLE_SUFFIXES[style] ?? "";
    const directions = validation.directions.map((d, i) => ({
      index: i,
      label: d.label,
      prompt: styleSuffix ? `${d.prompt}, ${styleSuffix}` : d.prompt,
    }));

    const jobId = uuidv4();
    const cost = imageModel.creditCost;
    const debit = await debitCreditsAmount(
      session.workspaceId,
      jobId,
      cost,
      `fresh batch (${imageModel.label})`,
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: params.id,
      workspace_id: session.workspaceId,
      type: "image_generation",
      status: "queued",
      input_params: {
        prompt: c.prompt,
        imageSize,
        style,
        model: imageModel.id,
        directions,
      },
      credits_charged: cost,
    });
    if (jobErr) {
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    const endpoints = imageFallbackEndpoints(imageModel.id);
    type Submitted = {
      index: number;
      label: string;
      prompt: string;
      requestId: string;
    };
    const results = await Promise.all(
      directions.map(async (d): Promise<Submitted | null> => {
        const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}&d=${d.index}`;
        try {
          const { requestId } = await enqueueWithFallback(
            endpoints,
            { prompt: d.prompt, image_size: imageSize, num_images: 1 },
            webhookUrl,
          );
          return { ...d, requestId };
        } catch {
          return null;
        }
      }),
    );
    const submitted = results.filter((r): r is Submitted => r !== null);
    if (submitted.length === 0) {
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start generation" },
        { status: 500 },
      );
    }

    await admin
      .from("creative_jobs")
      .update({
        fal_request_id: submitted[0].requestId,
        status: "processing",
        input_params: {
          prompt: c.prompt,
          imageSize,
          style,
          model: imageModel.id,
          expected_images: submitted.length,
          directions: submitted,
        },
      })
      .eq("id", jobId);

    return NextResponse.json(
      { jobId, creditCost: cost, count: submitted.length },
      { status: 201 },
    );
  },
);
