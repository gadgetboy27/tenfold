import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptProfileTokens } from "@/lib/social/token-crypto";
import { unlinkAyrshareSocial } from "@/lib/ayrshare/profiles";
import { revokeAtProvider, type RevokeOutcome } from "@/lib/social/revoke";
import { recordSocialEvent } from "@/lib/social/audit";
import { canManageConnections, CONNECTION_FORBIDDEN } from "@/lib/social/authz";

// POST /api/social/disconnect — fully remove a connected social from the
// workspace. A platform can be linked in BOTH systems at once (e.g. Facebook via
// native Meta OAuth AND via Ayrshare from earlier testing), and the profiles
// endpoint surfaces either — so a disconnect that only clears one leaves it
// showing "Connected". Clear both, always.
//
// Facebook drags Instagram with it (IG publishes on the Facebook Page's token
// and can't stand alone); every other platform removes just itself.
const bodySchema = z.object({ platform: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { platform } = parsed.data;

    // Disconnecting removes the whole workspace's ability to publish there —
    // not a per-member preference. See lib/social/authz.ts.
    if (!canManageConnections(session)) {
      return NextResponse.json(CONNECTION_FORBIDDEN, { status: 403 });
    }

    const admin = createSupabaseAdminClient();

    const targets =
      platform === "facebook" ? ["facebook", "instagram"] : [platform];

    // 0. Read the credentials BEFORE deleting them — revoking needs the token,
    //    and the old order (delete, then nothing) is precisely why a disconnect
    //    left the grant live at the provider.
    const { data: existing } = await admin
      .from("social_profiles")
      .select("platform, access_token, refresh_token")
      .eq("workspace_id", session.workspaceId)
      .in("platform", targets);

    const revocations: Record<string, RevokeOutcome> = {};
    // Decrypted: revoking at the provider means presenting the real
    // credential. Ciphertext here would make every revocation "fail" and send
    // users to do it by hand for no reason.
    for (const row of ((existing ?? []) as {
      platform: string;
      access_token: string | null;
      refresh_token: string | null;
    }[]).map((r) => decryptProfileTokens(r))) {
      // Instagram publishes on the Facebook Page's token — revoking it twice
      // would be the same call, and a "failed" second attempt would misreport
      // a revocation that actually succeeded.
      if (row.platform === "instagram" && targets.includes("facebook"))
        continue;
      revocations[row.platform] = await revokeAtProvider({
        platform: row.platform,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
      });
    }

    // 1. Native side: drop any social_profiles rows for these platforms.
    //    Unconditional, even when revocation failed — the user asked us to stop
    //    holding this credential, and refusing to let go of it because a third
    //    party was unreachable would be the wrong way round.
    const { error: delErr } = await admin
      .from("social_profiles")
      .delete()
      .eq("workspace_id", session.workspaceId)
      .in("platform", targets);
    if (delErr) throw new Error(delErr.message);

    // 2. Ayrshare side: unlink the same platforms (best-effort; Ayrshare returns
    // 200 even when a platform isn't linked, so this is safe and idempotent).
    const { data: workspace } = await admin
      .from("workspaces")
      .select("ayrshare_profile_key")
      .eq("id", session.workspaceId)
      .single();
    const profileKey = (
      workspace as { ayrshare_profile_key: string | null } | null
    )?.ayrshare_profile_key;
    if (profileKey) {
      await Promise.all(
        targets.map((p) =>
          unlinkAyrshareSocial(profileKey, p).catch(() => {
            // One platform failing to unlink shouldn't block the rest.
          }),
        ),
      );
    }

    for (const t of targets) {
      await recordSocialEvent(
        admin,
        { workspaceId: session.workspaceId, userId: session.userId },
        t,
        "disconnected",
        { revoke: revocations[t]?.status ?? "no_credential" },
      );
    }

    // The outcome per platform travels back so the UI can tell the truth about
    // what is still authorised. A bare `ok: true` here is what let "Disconnect"
    // read as "access removed" when it meant "our copy deleted".
    return NextResponse.json({ ok: true, removed: targets, revocations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
