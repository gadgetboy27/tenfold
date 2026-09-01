import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordSocialEvent } from "@/lib/social/audit";
import {
  exchangePinterestCode,
  getPinterestAccount,
  getPinterestBoards,
} from "@/lib/social/direct/pinterest";
import { verifyOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const workspaceId = verifyOAuthState(url.searchParams.get("state"));
  const oauthError = url.searchParams.get("error");

  const admin = createSupabaseAdminClient();

  async function workspaceSlug(): Promise<string | null> {
    if (!workspaceId) return null;
    const { data } = await admin
      .from("workspaces")
      .select("slug")
      .eq("id", workspaceId)
      .single();
    return (data as { slug: string } | null)?.slug ?? null;
  }

  const slug = await workspaceSlug();
  const base = slug ? `${process.env.APP_URL}/${slug}` : process.env.APP_URL!;

  if (oauthError || !code || !workspaceId) {
    return NextResponse.redirect(
      `${base}/settings/social?error=pinterest_denied`,
    );
  }

  try {
    const tokens = await exchangePinterestCode(code);
    const [account, boards] = await Promise.all([
      getPinterestAccount(tokens.accessToken),
      getPinterestBoards(tokens.accessToken),
    ]);

    // Every pin must name a board. Preserve whichever board the user picked
    // before, so a token refresh via reconnect doesn't silently retarget their
    // pins at a different board; otherwise default to the first one.
    const { data: existing } = await admin
      .from("social_profiles")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("platform", "pinterest")
      .maybeSingle();
    const priorBoardId = (
      existing as { metadata: { default_board_id?: string } | null } | null
    )?.metadata?.default_board_id;
    const stillExists = boards.some((b) => b.id === priorBoardId);
    const defaultBoardId = stillExists ? priorBoardId : boards[0]?.id;

    const { error } = await admin.from("social_profiles").upsert(
      {
        workspace_id: workspaceId,
        platform: "pinterest",
        handle: account.username,
        profile_display_name: account.username,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokens.expiresAt.toISOString(),
        metadata: {
          pinterest_boards: boards,
          ...(defaultBoardId ? { default_board_id: defaultBoardId } : {}),
        },
        connected_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,platform" },
    );
    if (error) throw new Error(error.message);

    // Connected but board-less is a dead end — Pinterest requires the user to
    // create a board in their own account, which we can't do for them.
    if (boards.length === 0) {
      // Security log: a connected account is standing permission to post in
      // this business's name. See lib/social/audit.ts.
      await recordSocialEvent(admin, { workspaceId }, "pinterest", "connected");
      return NextResponse.redirect(
        `${base}/settings/social?connected=pinterest&error=pinterest_no_boards`,
      );
    }
    return NextResponse.redirect(`${base}/settings/social?connected=pinterest`);
  } catch (err) {
    console.error(
      "[Pinterest OAuth] connect failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.redirect(
      `${base}/settings/social?error=pinterest_failed`,
    );
  }
}
