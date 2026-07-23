import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCampaignSchema } from "@/lib/validation/schemas";
import { debitCreditsAmount } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueWithFallback } from "@/lib/fal/queue";
import {
  getImageModel,
  imageFallbackEndpoints,
  VARIETY_IMAGE_MODELS,
  imageInputFor,
} from "@/lib/fal/models";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { validatePrompt } from "@/lib/fal/prompt-validator";
import { getEntitlements } from "@/lib/billing/entitlements";
import { v4 as uuidv4 } from "uuid";

const ASPECT_TO_IMAGE_SIZE: Record<string, string> = {
  "1:1": "square_hd",
  "4:5": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

// FLUX Kontext takes aspect_ratio (NOT image_size) — verified live. 4:5 isn't in
// its enum, so map it to the nearest supported portrait.
const ASPECT_TO_KONTEXT: Record<string, string> = {
  "1:1": "1:1",
  "4:5": "3:4",
  "16:9": "16:9",
  "9:16": "9:16",
};
const KONTEXT_ENDPOINT = "fal-ai/flux-pro/kontext";

const STYLE_SUFFIXES: Record<string, string> = {
  Photorealistic:
    "RAW photo, photorealistic, ultra-detailed, 8K UHD, DSLR camera, sharp focus, professional studio lighting, shallow depth of field, colour graded, hyperrealistic skin texture",
  Illustration:
    "digital illustration, vector art style, clean bold lines, vibrant flat colours, concept art, professional graphic design, ArtStation quality, smooth shading",
  Cinematic:
    "cinematic movie still, anamorphic widescreen lens, dramatic chiaroscuro lighting, film grain, ARRI Alexa footage, shallow depth of field, Hollywood colour grade, atmospheric haze",
  "3D": "3D render, Octane render, volumetric lighting, ray tracing, subsurface scattering, photorealistic PBR materials, cinema4d, ultra-detailed, 8K, sharp edges, studio HDRI",
};

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();
    const { data: campaigns, error } = await admin
      .from("campaigns")
      .select("*")
      .eq("workspace_id", session.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    if (!campaigns?.length) return NextResponse.json([]);

    // Fetch first image asset per campaign for thumbnails
    const ids = campaigns.map((c) => c.id as string);
    const { data: thumbAssets } = await admin
      .from("assets")
      .select("id, url, campaign_id")
      .in("campaign_id", ids)
      .eq("type", "image")
      .order("created_at", { ascending: true });

    const thumbMap: Record<string, string> = {};
    for (const a of thumbAssets ?? []) {
      if (!thumbMap[a.campaign_id as string])
        thumbMap[a.campaign_id as string] = a.url as string;
    }

    // What's already been done per campaign — surfaced in the Gallery so a
    // user can tell at a glance what's sorted (video/music/caption/composite/
    // published) instead of reopening every project to check.
    const [{ data: videoAssets }, { data: audioAssets }, { data: compositionRows }] =
      await Promise.all([
        admin
          .from("assets")
          .select("campaign_id")
          .in("campaign_id", ids)
          .in("type", ["video", "composed_video"]),
        admin
          .from("assets")
          .select("campaign_id")
          .in("campaign_id", ids)
          .eq("type", "audio"),
        // publish_records has no campaign_id — it hangs off compositions, so
        // fetch composition ids here and cross-reference below.
        admin.from("compositions").select("id, campaign_id").in("campaign_id", ids),
      ]);
    const videoCampaigns = new Set((videoAssets ?? []).map((a) => a.campaign_id as string));
    const audioCampaigns = new Set((audioAssets ?? []).map((a) => a.campaign_id as string));
    const compositionCampaigns = new Set(
      (compositionRows ?? []).map((c) => c.campaign_id as string),
    );
    const compositionToCampaign = new Map(
      (compositionRows ?? []).map((c) => [c.id as string, c.campaign_id as string]),
    );
    const publishedCampaigns = new Set<string>();
    if (compositionToCampaign.size > 0) {
      const { data: publishRows } = await admin
        .from("publish_records")
        .select("composition_id, status")
        .in("composition_id", [...compositionToCampaign.keys()])
        .in("status", ["published", "scheduled"]);
      for (const p of publishRows ?? []) {
        const cid = compositionToCampaign.get(p.composition_id as string);
        if (cid) publishedCampaigns.add(cid);
      }
    }
    // Prefer anchor asset URL when available
    const anchorIds = campaigns
      .map((c) => c.anchor_asset_id)
      .filter(Boolean) as string[];
    if (anchorIds.length) {
      const { data: anchorAssets } = await admin
        .from("assets")
        .select("id, url")
        .in("id", anchorIds);
      for (const c of campaigns) {
        if (c.anchor_asset_id) {
          const a = anchorAssets?.find((x) => x.id === c.anchor_asset_id);
          if (a) thumbMap[c.id as string] = a.url as string;
        }
      }
    }

    // Auto-recover campaigns still stuck in 'generating' (webhook may have been missed)
    const stale = campaigns.filter((c) => c.status === "generating");
    if (stale.length > 0) {
      const staleIds = stale.map((c) => c.id as string);
      const { data: jobRows } = await admin
        .from("creative_jobs")
        .select("campaign_id, status")
        .in("campaign_id", staleIds);

      const jobsByCampaign = new Map<string, string[]>();
      for (const j of jobRows ?? []) {
        const arr = jobsByCampaign.get(j.campaign_id as string) ?? [];
        arr.push(j.status as string);
        jobsByCampaign.set(j.campaign_id as string, arr);
      }

      const toReady: string[] = [];
      const toFailed: string[] = [];
      for (const c of stale) {
        const statuses = jobsByCampaign.get(c.id as string) ?? [];
        if (statuses.length === 0) continue;
        if (statuses.every((s) => s === "completed"))
          toReady.push(c.id as string);
        else if (statuses.every((s) => s === "failed" || s === "cancelled"))
          toFailed.push(c.id as string);
      }

      if (toReady.length) {
        await admin
          .from("campaigns")
          .update({ status: "ready" })
          .in("id", toReady);
        for (const c of campaigns) {
          if (toReady.includes(c.id as string)) c.status = "ready";
        }
      }
      if (toFailed.length) {
        await admin
          .from("campaigns")
          .update({ status: "failed" })
          .in("id", toFailed);
        for (const c of campaigns) {
          if (toFailed.includes(c.id as string)) c.status = "failed";
        }
      }
    }

    const enriched = campaigns.map((c) => {
      const id = c.id as string;
      const expansionData = c.expansion_data as
        | { script?: { content?: string | null } }
        | null;
      return {
        ...c,
        thumbnailUrl: thumbMap[id] ?? null,
        // Tell the client how old the 'generating' state is so it can show a stale indicator
        generatingSince: c.status === "generating" ? c.created_at : null,
        hasVideo: videoCampaigns.has(id),
        hasMusic: audioCampaigns.has(id),
        hasCaption: !!expansionData?.script?.content?.trim(),
        hasComposition: compositionCampaigns.has(id),
        isPublished: publishedCampaigns.has(id),
      };
    });
    return NextResponse.json(enriched);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized"
        ? 401
        : msg === "Not a workspace member"
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createCampaignSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // Pro perk: paid tiers get more distinct anchor directions (6–8) than the
    // free 4 — same base credit cost, a deliberately premium commercial-tier feel.
    const ent = await getEntitlements(session.workspaceId);

    // Resolve the chosen image model (fal gateway). Premium models are gated to
    // paid tiers — reject before touching credits.
    const imageModel = getImageModel(body.model);
    if (imageModel.proOnly && !ent.isPro) {
      return NextResponse.json(
        {
          error: `${imageModel.label} is a Pro model — upgrade to use it.`,
          upgrade: true,
        },
        { status: 403 },
      );
    }

    // Bring-your-own product photo → image-conditioned generation (FLUX Kontext).
    // A reference drives one consistent transformation, so it overrides variety.
    const useReference = !!body.referenceImageUrl;

    // Variety pack: the anchor set spans the top models (2 each) so the user
    // picks the look they prefer — Pro-only (premium models).
    const variety = body.variety === true && !useReference;
    if (variety && !ent.isPro) {
      return NextResponse.json(
        {
          error:
            "The variety pack (top models, side by side) is a Pro feature — upgrade to use it.",
          upgrade: true,
        },
        { status: 403 },
      );
    }

    // 0. Validate prompt quality before touching credits. The validator assists
    //    rather than blocks: a weak prompt is auto-upgraded to the AI-refined
    //    version and generation proceeds. We only hard-reject when there is
    //    nothing usable to generate from (e.g. prohibited/empty content).
    const validation = await validatePrompt(
      body.prompt,
      body.style ?? "Photorealistic",
      ent.maxVariations,
    );
    let effectivePrompt = body.prompt;
    let promptRefined = false;
    if (!validation.isValid) {
      if (
        validation.refinedPrompt &&
        validation.refinedPrompt.trim().length >= 5
      ) {
        effectivePrompt = validation.refinedPrompt.trim();
        promptRefined = true;
      } else {
        return NextResponse.json(
          {
            error: "Prompt rejected",
            issues: validation.issues,
            refinedPrompt: validation.refinedPrompt,
          },
          { status: 422 },
        );
      }
    }

    const campaignId = uuidv4();
    const jobId = uuidv4();
    const cost = variety ? CREDIT_COSTS.image_variety : imageModel.creditCost;

    // 1. Debit credits before anything else (per-model cost)
    const debit = await debitCreditsAmount(
      session.workspaceId,
      jobId,
      cost,
      `image generation (${imageModel.label})`,
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const imageSize =
      ASPECT_TO_IMAGE_SIZE[body.aspectRatio ?? "1:1"] ?? "square_hd";
    const styleSuffix = STYLE_SUFFIXES[body.style ?? ""] ?? "";

    // Normal: N distinct creative directions from ONE model. Variety pack: the
    // top 3 models each render the same 2 directions (2 images per model = 6),
    // so the six differ by MODEL and the user picks the look they prefer. Each
    // variety direction carries its own modelId so the webhook can tag the
    // asset — that tag is what powers the "which model do users pick" signal.
    interface Direction {
      index: number;
      label: string;
      prompt: string;
      modelId?: string;
    }
    const withStyle = (p: string) => (styleSuffix ? `${p}, ${styleSuffix}` : p);
    const directions: Direction[] = variety
      ? VARIETY_IMAGE_MODELS.flatMap((m, mi) =>
          validation.directions.slice(0, 2).map((d, di) => ({
            index: mi * 2 + di,
            label: `${m.label} · ${d.label}`,
            prompt: withStyle(d.prompt),
            modelId: m.id,
          })),
        )
      : validation.directions.map((d, i) => ({
          index: i,
          label: d.label,
          prompt: withStyle(d.prompt),
        }));

    // 2. Create campaign row
    const { error: campErr } = await admin.from("campaigns").insert({
      id: campaignId,
      workspace_id: session.workspaceId,
      created_by: session.userId,
      name: body.name ?? "Untitled Campaign",
      prompt: effectivePrompt,
      parameters: {
        aspectRatio: body.aspectRatio,
        style: body.style,
        model: useReference ? "flux-kontext" : imageModel.id,
        referenceImageUrl: body.referenceImageUrl,
        originalPrompt: promptRefined ? body.prompt : undefined,
      },
      status: "generating",
    });
    if (campErr) throw new Error(campErr.message);

    // 3. Create job row (one job, four fal requests)
    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "image_generation",
      status: "queued",
      input_params: {
        prompt: effectivePrompt,
        imageSize,
        style: body.style,
        model: imageModel.id,
        directions,
      },
      credits_charged: cost,
    });
    if (jobErr) throw new Error(jobErr.message);

    // 4. Enqueue one fal request per direction (num_images:1 each). The webhook
    //    is told which direction via ?d=<index>. Refund only if ALL fail.
    type Submitted = {
      index: number;
      label: string;
      prompt: string;
      requestId: string;
      modelId?: string;
    };
    // Fire all fal submits in parallel so campaign start is fast. A direction
    // that fails is dropped; the rest still run.
    // - Normal: try the chosen model, then fall through to reliable endpoints.
    // - Variety: each direction is pinned to ITS model (no cross-model fallback,
    //   so the tag stays accurate) with that model's own params.
    const fallbackEndpoints = imageFallbackEndpoints(imageModel.id);
    const results = await Promise.all(
      directions.map(async (d): Promise<Submitted | null> => {
        const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}&d=${d.index}`;
        const vm = d.modelId
          ? VARIETY_IMAGE_MODELS.find((m) => m.id === d.modelId)
          : undefined;
        const endpoints = useReference
          ? [KONTEXT_ENDPOINT]
          : vm
            ? [vm.endpoint]
            : fallbackEndpoints;
        const input = useReference
          ? {
              image_url: body.referenceImageUrl,
              prompt: d.prompt,
              aspect_ratio:
                ASPECT_TO_KONTEXT[body.aspectRatio ?? "1:1"] ?? "1:1",
              num_images: 1,
            }
          : vm
            ? imageInputFor(vm, d.prompt, imageSize)
            : { prompt: d.prompt, image_size: imageSize, num_images: 1 };
        try {
          const { requestId } = await enqueueWithFallback(
            endpoints,
            input,
            webhookUrl,
          );
          return { ...d, requestId };
        } catch {
          return null; // others can still succeed
        }
      }),
    );
    const submitted: Submitted[] = results.filter(
      (r): r is Submitted => r !== null,
    );

    if (submitted.length === 0) {
      await refundCredits(jobId);
      throw new Error("Image generation could not be submitted to fal.ai");
    }

    // 5. Persist submitted requests + expected count, mark processing.
    await admin
      .from("creative_jobs")
      .update({
        fal_request_id: submitted[0].requestId,
        status: "processing",
        input_params: {
          prompt: effectivePrompt,
          imageSize,
          style: body.style,
          model: imageModel.id,
          expected_images: submitted.length,
          directions: submitted,
        },
      })
      .eq("id", jobId);

    return NextResponse.json(
      {
        campaignId,
        jobId,
        status: "generating",
        promptRefined,
        effectivePrompt,
        directions: submitted.map((s) => s.label),
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized" ? 401 : msg === "Insufficient credits" ? 402 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
