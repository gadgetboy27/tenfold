import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueJob } from "@/lib/fal/queue";
import { ensureLogoCampaign } from "@/app/api/logo/route";
import { validateVectorizeUpload, extensionOf } from "@/lib/logo/upload";
import { resolveOwnedAsset } from "@/lib/assets/owned";

// POST /api/logo/vectorize — the acquisition hook: upload an old raster logo,
// get a clean SVG back (Recraft vectorize). 1 credit. Creates a lightweight
// project so the result has a home; the webhook records it as final_asset_id.
//
// Upload rules (png/jpg/webp under 5MB) live in lib/logo/upload for testability.

const ERROR_MESSAGES = {
  empty: "No file provided",
  type: "Upload a PNG, JPG or WEBP image",
  size: "Image must be under 5 MB",
} as const;

export async function POST(req: Request) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    // Two ways in, one pipeline: a multipart file upload, or JSON naming an
    // asset the workspace already owns (the gallery picker). The asset path
    // resolves the URL server-side under this workspace — never trusting a
    // client-supplied URL — and needs no second copy in storage.
    const isJson = (req.headers.get("content-type") ?? "").includes(
      "application/json",
    );
    let sourceUrl: string;
    let sourceName: string;

    if (isJson) {
      const body = (await req.json()) as { assetId?: unknown };
      if (typeof body.assetId !== "string" || !body.assetId) {
        return NextResponse.json(
          { error: ERROR_MESSAGES.empty },
          { status: 400 },
        );
      }
      const owned = await resolveOwnedAsset(
        admin,
        session.workspaceId,
        body.assetId,
      );
      if (!owned) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      sourceUrl = owned.url;
      sourceName = "Gallery logo";
    } else {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: ERROR_MESSAGES.empty },
          { status: 400 },
        );
      }
      const invalid = validateVectorizeUpload(file);
      if (invalid) {
        return NextResponse.json(
          { error: ERROR_MESSAGES[invalid] },
          { status: 400 },
        );
      }
      const ext = extensionOf(file.name);

      // Store the source raster so vectorize can pull it from a public URL.
      const uploadPath = `uploads/${session.workspaceId}/${uuidv4()}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("assets")
        .upload(uploadPath, await file.arrayBuffer(), {
          contentType: file.type,
        });
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      const { data: urlData } = admin.storage
        .from("assets")
        .getPublicUrl(uploadPath);
      sourceUrl = urlData.publicUrl;
      sourceName = file.name.replace(/\.[^.]+$/, "");
    }

    const projectId = uuidv4();
    const jobId = uuidv4();
    const cost = CREDIT_COSTS.logo_vectorize;

    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "logo_vectorize",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const { error: projErr } = await admin.from("logo_projects").insert({
      id: projectId,
      workspace_id: session.workspaceId,
      created_by: session.userId,
      brief: { businessName: sourceName, source: "vectorize" },
      status: "generating",
    });
    if (projErr) {
      await refundCredits(jobId);
      throw new Error(projErr.message);
    }

    const campaignId = await ensureLogoCampaign(
      admin,
      session.workspaceId,
      session.userId,
    );

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "logo_vectorize",
      status: "queued",
      input_params: { logoProjectId: projectId, source_url: sourceUrl },
      credits_charged: cost,
    });
    if (jobErr) {
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}`;
    try {
      const { requestId } = await enqueueJob(
        "logo_vectorize",
        { image_url: sourceUrl },
        webhookUrl,
      );
      await admin
        .from("creative_jobs")
        .update({ fal_request_id: requestId, status: "processing" })
        .eq("id", jobId);
    } catch {
      await admin
        .from("creative_jobs")
        .update({
          status: "failed",
          error_message: "Vectorize submission failed",
        })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start vectorize" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { projectId, jobId, creditCost: cost },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
