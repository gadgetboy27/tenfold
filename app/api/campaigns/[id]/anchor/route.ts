import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { setAnchorSchema } from "@/lib/validation/schemas";

export const PATCH = withWorkspace<{ id: string }>(
  async (req, { db, params }) => {
    const { assetId } = setAnchorSchema.parse(await req.json());

    // Confirm asset belongs to this campaign (workspace filter comes from db)
    const { data: asset } = await db
      .from("assets")
      .select("id")
      .eq("id", assetId)
      .eq("campaign_id", params.id)
      .single();

    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const { data: updated, error } = await db
      .from("campaigns")
      .update({ anchor_asset_id: assetId, status: "expanding" })
      .eq("id", params.id)
      .select()
      .single();

    if (error || !updated)
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    return NextResponse.json(updated);
  },
);
