import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/api/error-message";

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

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid destination" },
        { status: 400 },
      );
    }
    const admin = createSupabaseAdminClient();

    const { data: existing } = await admin
      .from("social_profiles")
      .select("metadata")
      .eq("workspace_id", session.workspaceId)
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

    const { error } = await admin
      .from("social_profiles")
      .update({ metadata: { ...current, ...patch } })
      .eq("workspace_id", session.workspaceId)
      .eq("platform", parsed.data.platform);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, ...patch });
  } catch (err) {
    const msg = errorMessage(err, "Could not save destination");
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
