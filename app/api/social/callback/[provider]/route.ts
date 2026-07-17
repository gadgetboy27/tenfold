import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/social/providers";
import { verifyOAuthState } from "@/lib/social/oauth-state";
import { saveConnection } from "@/lib/social/tokens";
import { getRedditIdentity } from "@/lib/social/reddit";
import "@/lib/social/register";

// GET /api/social/callback/:provider — finish the OAuth round-trip.
//
// Deliberately NOT wrapped in withWorkspace: the user arrives here redirected
// from the provider, so the request carries no session we can trust. The
// workspace comes from the signed state instead, which is the only reason this
// is safe — an unsigned state would let anyone attach their own account to
// someone else's workspace.

async function settingsUrl(
  workspaceId: string,
  query: string,
): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("workspaces")
    .select("slug")
    .eq("id", workspaceId)
    .single();
  const slug = (data as { slug: string } | null)?.slug;
  const base = process.env.APP_URL ?? "";
  return slug
    ? `${base}/${slug}/settings/social?${query}`
    : `${base}/?${query}`;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider: id } = await ctx.params;
  const url = new URL(req.url);
  const provider = getProvider(id);
  if (!provider) {
    return NextResponse.json(
      { error: `Unknown provider ${id}` },
      { status: 404 },
    );
  }

  const workspaceId = verifyOAuthState(url.searchParams.get("state"));
  if (!workspaceId) {
    // Forged, tampered, or a stale tab — never trust it enough to write a row.
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  // The user denied access, or the provider errored. Bounce them back rather
  // than leaving them on a JSON blob.
  const denied = url.searchParams.get("error");
  if (denied) {
    return NextResponse.redirect(
      await settingsUrl(workspaceId, `error=${encodeURIComponent(denied)}`),
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      await settingsUrl(workspaceId, "error=no_code"),
    );
  }

  try {
    const tokens = await provider.exchangeCode(code);
    // Resolve a display handle so Settings shows WHICH account is connected —
    // "Reddit ✓" is useless when someone manages several.
    const identity =
      id === "reddit" ? await getRedditIdentity(tokens.accessToken) : null;

    await saveConnection({
      workspaceId,
      platform: id,
      tokens,
      handle: identity?.name ?? null,
      displayName: identity?.name ?? null,
    });
    return NextResponse.redirect(
      await settingsUrl(workspaceId, `connected=${id}`),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.redirect(
      await settingsUrl(workspaceId, `error=${encodeURIComponent(msg)}`),
    );
  }
}
