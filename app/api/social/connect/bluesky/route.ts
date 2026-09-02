import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { canManageConnections, CONNECTION_FORBIDDEN } from "@/lib/social/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptProfileTokens } from "@/lib/social/token-crypto";
import { verifyBlueskyCredentials } from "@/lib/social/direct/bluesky";
import { errorMessage } from "@/lib/api/error-message";
import { recordSocialEvent } from "@/lib/social/audit";

// Bluesky has no OAuth app to register, so unlike every other network this
// connect is a plain form POST rather than a redirect + callback pair.
const bodySchema = z.object({
  // Accept "@handle.bsky.social" or a bare handle — users copy it either way.
  identifier: z.string().min(1).max(253),
  // App password format is xxxx-xxxx-xxxx-xxxx. Not enforced strictly here;
  // Bluesky rejects a real account password with a clear message of its own.
  appPassword: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    // Connecting sets where the whole workspace publishes — owner/admin only.
    // See lib/social/authz.ts for why this matches the publish approval roles.
    if (!canManageConnections(session)) {
      return NextResponse.json(CONNECTION_FORBIDDEN, { status: 403 });
    }
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter your Bluesky handle and an app password." },
        { status: 400 },
      );
    }

    const identifier = parsed.data.identifier.trim().replace(/^@/, "");
    const appPassword = parsed.data.appPassword.trim();

    // Verify before storing — a typo'd credential saved as "connected" only
    // reveals itself at the first publish, which is the worst time to find out.
    const { did, handle } = await verifyBlueskyCredentials(
      identifier,
      appPassword,
    );

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("social_profiles").upsert(
      encryptProfileTokens({
        workspace_id: session.workspaceId,
        platform: "bluesky",
        handle,
        profile_display_name: handle,
        platform_account_id: did,
        access_token: appPassword,
        refresh_token: null,
        // App passwords don't expire — they're revoked, not aged out. null here
        // is what tells lib/social/direct's refresh path to skip Bluesky.
        token_expires_at: null,
        connected_at: new Date().toISOString(),
      }),
      { onConflict: "workspace_id,platform" },
    );
    if (error) throw new Error(error.message);

    // Connecting is standing permission to post in the business's name, so it
    // belongs in the security log exactly as much as a disconnect does.
    //
    // Bluesky is the ONE connect path with a real session — every other
    // network is born in an OAuth callback that has only the signed state to
    // go on — so this is the one place a full actor is always available, and
    // it was the one place recording nothing at all.
    //
    // The handle, never the app password: this table is read by humans, and a
    // credential in a log is a credential in a screenshot.
    await recordSocialEvent(
      admin,
      { workspaceId: session.workspaceId, userId: session.userId },
      "bluesky",
      "connected",
      { target: handle },
    );

    return NextResponse.json({ ok: true, handle });
  } catch (err) {
    const msg = errorMessage(err, "Could not connect Bluesky");
    const status = msg === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
