import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { z } from "zod";
import { canManageConnections, CONNECTION_FORBIDDEN } from "@/lib/social/authz";
import { recordSocialEvent } from "@/lib/social/audit";

// Two of the direct-backend networks need a destination the caption can't
// carry: Reddit needs a subreddit, Pinterest needs a board. Both are stored on
// social_profiles.metadata as the connection's default and can still be
// overridden per publish (publishSchema.subreddit / .pinterestBoardId).
const bodySchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("reddit"),
    // Accept "r/foo", "/r/foo" or "foo"; Reddit names are 3–21 chars of
    // [A-Za-z0-9_].
    subreddit: z
      .string()
      .trim()
      .transform((s) => s.replace(/^\/?r\//i, ""))
      .pipe(z.string().regex(/^[A-Za-z0-9_]{3,21}$/, "Not a subreddit name")),
  }),
  z.object({
    platform: z.literal("pinterest"),
    boardId: z.string().min(1).max(64),
  }),
]);

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  // Same gate, same reason: a subreddit or a board is WHERE the workspace's
  // posts land. Gating who may connect an account while leaving the
  // destination inside it open re-opens the hole one level down.
  if (!canManageConnections(session)) {
    return NextResponse.json(CONNECTION_FORBIDDEN, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid destination" },
      { status: 400 },
    );
  }

  const { data: existing } = await db
    .from("social_profiles")
    .select("metadata")
    .eq("platform", parsed.data.platform)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json(
      { error: `Connect ${parsed.data.platform} first.` },
      { status: 404 },
    );
  }

  // Merge rather than replace — Pinterest's metadata also holds the cached
  // board list, which a blind overwrite would wipe out.
  const current =
    (existing as { metadata: Record<string, unknown> | null }).metadata ?? {};
  const patch =
    parsed.data.platform === "reddit"
      ? { default_subreddit: parsed.data.subreddit }
      : { default_board_id: parsed.data.boardId };

  const { error } = await db
    .from("social_profiles")
    .update({ metadata: { ...current, ...patch } })
    .eq("platform", parsed.data.platform);
  if (error) throw new Error(error.message);

  // A destination is where a post actually lands. Logging the connect but
  // not the subreddit it was re-pointed at records the door and not the room.
  await recordSocialEvent(
    admin,
    { workspaceId: session.workspaceId, userId: session.userId },
    parsed.data.platform,
    "destination_set",
    {
      target:
        parsed.data.platform === "reddit"
          ? parsed.data.subreddit
          : parsed.data.boardId,
    },
  );

  return NextResponse.json({ ok: true, ...patch });
});
