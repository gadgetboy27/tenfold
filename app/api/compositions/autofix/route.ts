import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { withWorkspace } from "@/lib/api/with-workspace";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { autofixLayout } from "@/lib/claude/autofix";
import {
  autofixLayerSchema,
  autofixZoneSchema,
} from "@/lib/composition/autofix";

// POST /api/compositions/autofix — the Phase 6 vision polish. Sends a rendered
// format + its safe zones + layer positions to Claude vision, which proposes
// per-layer nudges (applied client-side as per-format overrides). Costs credits;
// mirrors the auto-caption debit/refund pattern (a creative_jobs row anchors the
// ledger transaction and is refunded if the call fails).

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  platformLabel: z.string().min(1).max(60),
  /** Base64 PNG/JPEG of the rendered format (data-URL prefix allowed). */
  image: z.string().min(1).max(4_000_000),
  mediaType: z.enum(["image/png", "image/jpeg"]).default("image/png"),
  layers: z.array(autofixLayerSchema).min(1).max(20),
  zones: z.array(autofixZoneSchema).max(10),
});

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid auto-fix request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { campaignId, aspect, platformLabel, image, mediaType, layers, zones } =
    parsed.data;
  const imageBase64 = image.includes(",") ? image.split(",")[1] : image;

  // Order matters for the ledger: refund_credits() reverses a debit by reading
  // creative_jobs.credits_charged, so the JOB ROW MUST EXIST BEFORE WE DEBIT —
  // otherwise a failed job insert would strand the charge with nothing to
  // refund. So: verify the campaign (workspace-scoped) → insert the job →
  // debit → run the fix. Any failure after the debit refunds cleanly.
  const jobId = uuidv4();
  const cost = CREDIT_COSTS.layout_autofix;

  // 1. Campaign must belong to this workspace (also prevents the FK failure
  //    that would otherwise strand a charge). Uses the scoped db client.
  const { data: campaign } = await db
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // 2. Insert the job row first (error-checked) — no debit yet, so a failure
  //    here can never leave a charge.
  const { error: jobErr } = await admin.from("creative_jobs").insert({
    id: jobId,
    campaign_id: campaignId,
    workspace_id: session.workspaceId,
    type: "layout_autofix",
    status: "processing",
    input_params: { aspect, platformLabel },
    credits_charged: cost,
  });
  if (jobErr) {
    return NextResponse.json(
      { error: "Could not start auto-fix" },
      { status: 500 },
    );
  }

  // 3. Debit. If insufficient, mark the job failed and 402 (no charge occurred).
  const debit = await debitCredits(
    session.workspaceId,
    jobId,
    "layout_autofix",
  );
  if (!debit.success) {
    await admin
      .from("creative_jobs")
      .update({ status: "failed", error_message: "Insufficient credits" })
      .eq("id", jobId);
    return NextResponse.json(
      { error: "Insufficient credits" },
      { status: 402 },
    );
  }

  // 4. Run the vision fix. Any failure from here refunds (the job row exists).
  try {
    const adjustments = await autofixLayout({
      imageBase64,
      mediaType,
      platformLabel,
      aspect,
      layers,
      zones,
    });
    // Nothing to change → don't charge for a no-op (the user got no value).
    if (adjustments.length === 0) {
      await refundCredits(jobId);
      await admin
        .from("creative_jobs")
        .update({ status: "completed", error_message: "No changes needed" })
        .eq("id", jobId);
      return NextResponse.json({ adjustments: [], refunded: true });
    }
    await admin
      .from("creative_jobs")
      .update({ status: "completed" })
      .eq("id", jobId);
    return NextResponse.json(
      { adjustments, creditCost: cost, newBalance: debit.newBalance },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Auto-fix failed";
    await admin
      .from("creative_jobs")
      .update({ status: "failed", error_message: msg })
      .eq("id", jobId);
    await refundCredits(jobId); // don't charge for a failed fix
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
