import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueJob } from "@/lib/fal/queue";
import { buildLogoPrompt, isLogoStyle, LOGO_STYLES } from "@/lib/logo/prompts";

// POST /api/logo — generate 4 logo candidates from a prompt.
//
// Gated behind FEATURE_LOGO_BUILDER: a real 404 when off, so the endpoint is
// absent in production until launch. Reuses the whole async image pipeline —
// one fal image job (num_images: 4) whose results the existing webhook saves as
// image assets. The only logo-specific bit is the prompt (lib/logo/prompts.ts).

const bodySchema = z.object({
  brandName: z.string().trim().min(1).max(60),
  style: z.enum(LOGO_STYLES),
  brief: z.string().trim().max(300).optional(),
});

/** One holding campaign per workspace keeps logo assets in the gallery/brand
 *  kit like anything else, without inventing a campaign per attempt. */
async function ensureLogoCampaign(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string,
  userId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Logos")
    .limit(1)
    .maybeSingle();
  const found = (existing as { id: string } | null)?.id;
  if (found) return found;

  const id = uuidv4();
  const { error } = await admin.from("campaigns").insert({
    id,
    workspace_id: workspaceId,
    name: "Logos",
    prompt: "Logo builder",
    status: "ready",
    created_by: userId,
  });
  if (error)
    throw new Error(`Could not create logo campaign: ${error.message}`);
  return id;
}

// GET /api/logo?jobId=… — poll a generation's status + its logo images. The
// webhook saves candidates as image assets tagged with this job_id, so the UI
// polls here until they land.
export async function GET(req: Request) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const jobId = new URL(req.url).searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();

    const { data: job } = await admin
      .from("creative_jobs")
      .select("status, error_message")
      .eq("id", jobId)
      .eq("workspace_id", session.workspaceId) // tenant scope
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const { data: assets } = await admin
      .from("assets")
      .select("id, url")
      .eq("job_id", jobId)
      .eq("workspace_id", session.workspaceId)
      .eq("type", "image");

    const j = job as { status: string; error_message: string | null };
    return NextResponse.json({
      status: j.status,
      error: j.error_message,
      images: (assets ?? []) as { id: string; url: string }[],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const session = await getSession(req);
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { brandName, style, brief } = parsed.data;
    if (!isLogoStyle(style)) {
      return NextResponse.json({ error: "Unknown style" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const campaignId = await ensureLogoCampaign(
      admin,
      session.workspaceId,
      session.userId,
    );

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.logo_generation;

    // Debit first, atomically with the job (CLAUDE.md §1). 402 on empty wallet
    // BEFORE any fal call.
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "logo_generation",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const { prompt, negativePrompt } = buildLogoPrompt({
      brandName,
      style,
      brief,
    });

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "logo_generation",
      status: "queued",
      input_params: { brandName, style, brief: brief ?? null, prompt },
      credits_charged: cost,
    });
    if (jobErr) {
      // Debited but no job row — refund, or the credits vanish (a job that
      // never existed can't fail-refund later).
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    try {
      const { requestId } = await enqueueJob(
        "image_generation",
        {
          prompt,
          negative_prompt: negativePrompt,
          image_size: "square_hd",
          num_images: 4,
        },
        webhookUrl,
      );
      await admin
        .from("creative_jobs")
        .update({ fal_request_id: requestId, status: "processing" })
        .eq("id", jobId);
    } catch {
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: "Logo submission failed" })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start logo generation" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { jobId, campaignId, creditCost: cost },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
