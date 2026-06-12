import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCampaignSchema } from "@/lib/validation/schemas";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { enqueueJob } from "@/lib/fal/queue";
import { validatePrompt } from "@/lib/fal/prompt-validator";
import { v4 as uuidv4 } from "uuid";

const ASPECT_TO_IMAGE_SIZE: Record<string, string> = {
  "1:1": "square_hd",
  "4:5": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

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

    const enriched = campaigns.map((c) => ({
      ...c,
      thumbnailUrl: thumbMap[c.id as string] ?? null,
      // Tell the client how old the 'generating' state is so it can show a stale indicator
      generatingSince: c.status === "generating" ? c.created_at : null,
    }));
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

    // 0. Validate prompt quality before touching credits. The validator assists
    //    rather than blocks: a weak prompt is auto-upgraded to the AI-refined
    //    version and generation proceeds. We only hard-reject when there is
    //    nothing usable to generate from (e.g. prohibited/empty content).
    const validation = await validatePrompt(
      body.prompt,
      body.style ?? "Photorealistic",
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
    const cost = CREDIT_COSTS.image_generation;

    // 1. Debit credits before anything else
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "image_generation",
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

    // Four DISTINCT creative directions (AI-generated, hardcoded-lens fallback)
    // so the anchor set genuinely contrasts instead of being near-duplicates.
    // Still 4 images total, so the credit cost is unchanged.
    const directions = validation.directions.map((d, i) => ({
      index: i,
      label: d.label,
      prompt: styleSuffix ? `${d.prompt}, ${styleSuffix}` : d.prompt,
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
    };
    // Fire all four fal submits in parallel (not sequentially) so campaign start
    // is ~4x faster. A direction that fails is dropped; the rest still run.
    const results = await Promise.all(
      directions.map(async (d): Promise<Submitted | null> => {
        const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}&d=${d.index}`;
        try {
          const { requestId } = await enqueueJob(
            "image_generation",
            { prompt: d.prompt, image_size: imageSize, num_images: 1 },
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
