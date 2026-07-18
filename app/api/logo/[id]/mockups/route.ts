import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueJob } from "@/lib/fal/queue";
import { setBackground } from "@/lib/logo/svg";
import { ensureLogoCampaign } from "@/app/api/logo/route";

// POST /api/logo/:id/mockups — 4 contextual mockups (logo in the wild) via FLUX
// kontext, using a raster of the finalized logo as the reference image. Debit
// logo_mockups (2cr). Async fan-out: 4 fal requests share one job via
// input_params.directions + expected_images — the same completion gate as
// concepts. Results (JPG scenes) land on the existing webhook.
const MOCKUP_SCENES = [
  "this exact logo printed on a matte business card resting on a wooden desk, soft daylight, product photography",
  "this exact logo as exterior signage on a modern storefront, street photography, golden hour",
  "this exact logo as the app icon on a smartphone home screen held in a hand",
  "this exact logo embroidered on a folded cotton t-shirt on a neutral background, product photography",
];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const { id } = await ctx.params;
    const admin = createSupabaseAdminClient();

    const { data: project } = await admin
      .from("logo_projects")
      .select("id, final_asset_id")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    const finalId = (project as { final_asset_id: string | null } | null)
      ?.final_asset_id;
    if (!project || !finalId) {
      return NextResponse.json(
        { error: "Finalise your logo before creating mockups" },
        { status: 400 },
      );
    }

    const { data: asset } = await admin
      .from("assets")
      .select("url")
      .eq("id", finalId)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    const svgUrl = (asset as { url: string } | null)?.url;
    if (!svgUrl) {
      return NextResponse.json(
        { error: "Final logo missing" },
        { status: 400 },
      );
    }

    // FLUX kontext needs a raster reference at a public URL — rasterize the
    // finalized SVG (on white) and store it so fal can fetch it.
    const svg = await (await fetch(svgUrl)).text();
    const png = await sharp(Buffer.from(setBackground(svg, "light")), {
      density: 384,
    })
      .resize(1024, 1024, { fit: "contain", background: "#ffffff" })
      .png()
      .toBuffer();
    const refPath = `${session.workspaceId}/logo-mockup-refs/${uuidv4()}.png`;
    const { error: upErr } = await admin.storage
      .from("assets")
      .upload(refPath, png, { contentType: "image/png" });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    const refUrl = admin.storage.from("assets").getPublicUrl(refPath)
      .data.publicUrl;

    const jobId = uuidv4();
    const cost = CREDIT_COSTS.logo_mockups;
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "logo_mockups",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const campaignId = await ensureLogoCampaign(
      admin,
      session.workspaceId,
      session.userId,
    );
    const directions = MOCKUP_SCENES.map((prompt, index) => ({
      index,
      label: `Mockup ${index + 1}`,
      prompt,
    }));

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "logo_mockups",
      status: "queued",
      input_params: { logoProjectId: id, directions },
      credits_charged: cost,
    });
    if (jobErr) {
      await refundCredits(jobId);
      throw new Error(jobErr.message);
    }

    type Submitted = { index: number; label: string; requestId: string };
    const results = await Promise.all(
      directions.map(async (d): Promise<Submitted | null> => {
        const webhookUrl = `${process.env.APP_URL}/api/webhooks/fal?j=${jobId}&d=${d.index}`;
        try {
          const { requestId } = await enqueueJob(
            "image_variation",
            { image_url: refUrl, prompt: d.prompt, num_images: 1 },
            webhookUrl,
          );
          return { index: d.index, label: d.label, requestId };
        } catch {
          return null;
        }
      }),
    );
    const submitted = results.filter((r): r is Submitted => r !== null);
    if (submitted.length === 0) {
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: "No mockup submitted" })
        .eq("id", jobId);
      await refundCredits(jobId);
      return NextResponse.json(
        { error: "Could not start mockups" },
        { status: 500 },
      );
    }

    await admin
      .from("creative_jobs")
      .update({
        fal_request_id: submitted[0].requestId,
        status: "processing",
        input_params: {
          logoProjectId: id,
          directions: submitted,
          expected_images: submitted.length,
        },
      })
      .eq("id", jobId);

    return NextResponse.json(
      { jobId, mockups: submitted.length, creditCost: cost },
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
