import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { refundCredits } from "@/lib/credits/refund";

export const POST = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { id } = params;

    // Verify campaign belongs to this workspace
    const { data: campaign } = await db
      .from("campaigns")
      .select("id, status")
      .eq("id", id)
      .single();

    if (!campaign)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Find all cancellable jobs for this campaign
    const { data: jobs } = await db
      .from("creative_jobs")
      .select("id, status, credits_charged, type")
      .eq("campaign_id", id)
      .in("status", ["queued", "processing"]);

    const cancellable = (jobs ?? []) as {
      id: string;
      status: string;
      credits_charged: number;
      type: string;
    }[];

    // Cancel each job and refund its credits
    if (cancellable.length > 0) {
      const jobIds = cancellable.map((j) => j.id);
      await db
        .from("creative_jobs")
        .update({ status: "cancelled", error_message: "Cancelled by user" })
        .in("id", jobIds);

      // Refund credits for each cancelled job (only if they had a charge)
      await Promise.all(
        cancellable
          .filter((j) => j.credits_charged > 0)
          .map((j) => refundCredits(j.id)),
      );
    }

    // Check if any assets already exist (from a partial success)
    const { data: existingAssets } = await db
      .from("assets")
      .select("id")
      .eq("campaign_id", id)
      .limit(1);

    const hasAssets = (existingAssets?.length ?? 0) > 0;
    const newStatus = hasAssets ? "ready" : "failed";

    await db.from("campaigns").update({ status: newStatus }).eq("id", id);

    return NextResponse.json({
      ok: true,
      status: newStatus,
      cancelledJobs: cancellable.length,
      creditsRefunded: cancellable.reduce(
        (sum, j) => sum + j.credits_charged,
        0,
      ),
    });
  },
);
