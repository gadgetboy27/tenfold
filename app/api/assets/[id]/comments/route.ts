import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { createCommentSchema } from "@/lib/validation/schemas";

// GET /api/assets/:id/comments — list the thread for one asset (workspace-scoped).
export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { data, error } = await db
      .from("asset_comments")
      .select("*")
      .eq("asset_id", params.id)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ comments: data ?? [] });
  },
);

// POST /api/assets/:id/comments — add a user comment / annotation.
export const POST = withWorkspace<{ id: string }>(
  async (req, { db, session, params }) => {
    const body = createCommentSchema.parse(await req.json());

    // Asset lookup is workspace-scoped: confirms ownership and yields campaign_id.
    const { data: asset } = await db
      .from("assets")
      .select("id, campaign_id")
      .eq("id", params.id)
      .single();

    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const { data, error } = await db
      .from("asset_comments")
      .insert({
        campaign_id: (asset as { campaign_id: string }).campaign_id,
        asset_id: params.id,
        author_id: session.userId,
        kind: "user",
        body: body.body,
        anchor: body.anchor ?? {},
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ comment: data }, { status: 201 });
  },
);
