import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";

// POST /api/compositions/lock — freeze or re-open a project's ad. Locked means
// the stage cannot be edited anywhere (the client greys every other section
// and /api/compositions/save refuses writes) until it is unlocked here. The
// Publish page is the only caller: it is the one place an ad is rendered,
// locked and unlocked.
//
// Stored in the existing `compositions.status` column ("locked" | "draft"), so
// no migration — and it lives next to the doc it freezes rather than on the
// campaign.
const bodySchema = z.object({
  campaignId: z.string().uuid(),
  locked: z.boolean(),
});

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lock request" },
      { status: 400 },
    );
  }
  const { campaignId, locked } = parsed.data;

  // Tenant check through the workspace-scoped client first.
  const { data: campaign } = await db
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: row } = await admin
    .from("compositions")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("workspace_id", session.workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = (row as { id: string } | null)?.id;
  if (!id) {
    return NextResponse.json(
      { error: "There's nothing to lock yet — build the ad first." },
      { status: 404 },
    );
  }

  const { error } = await admin
    .from("compositions")
    .update({
      status: locked ? "locked" : "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", session.workspaceId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locked });
});
