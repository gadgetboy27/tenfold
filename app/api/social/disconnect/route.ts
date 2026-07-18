import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { unlinkAyrshareSocial } from "@/lib/ayrshare/profiles";

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
    const admin = createSupabaseAdminClient();

    const targets =
      platform === "facebook" ? ["facebook", "instagram"] : [platform];

    // 1. Native side: drop any social_profiles rows for these platforms.
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

    return NextResponse.json({ ok: true, removed: targets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
