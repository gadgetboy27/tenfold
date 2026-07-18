import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { unlinkAyrshareSocial } from "@/lib/ayrshare/profiles";

// POST /api/social/disconnect — remove a connected social from the workspace.
//
// Facebook/Instagram are native (Meta OAuth) — delete their social_profiles
// row. Disconnecting Facebook also removes Instagram, since IG publishes on the
// Facebook Page's token and can't stand alone. Everything else lives in
// Ayrshare, so unlink it there.
const bodySchema = z.object({ platform: z.string().min(1) });
const NATIVE = new Set(["facebook", "instagram"]);

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { platform } = parsed.data;
    const admin = createSupabaseAdminClient();

    if (NATIVE.has(platform)) {
      // Facebook drags Instagram with it; Instagram alone removes just itself.
      const toRemove =
        platform === "facebook" ? ["facebook", "instagram"] : ["instagram"];
      const { error } = await admin
        .from("social_profiles")
        .delete()
        .eq("workspace_id", session.workspaceId)
        .in("platform", toRemove);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, removed: toRemove });
    }

    // Ayrshare-managed platform — unlink on their side using the workspace key.
    const { data: workspace } = await admin
      .from("workspaces")
      .select("ayrshare_profile_key")
      .eq("id", session.workspaceId)
      .single();
    const profileKey = (
      workspace as { ayrshare_profile_key: string | null } | null
    )?.ayrshare_profile_key;
    if (!profileKey) {
      // No profile → nothing linked through Ayrshare; treat as already gone.
      return NextResponse.json({ ok: true, removed: [platform] });
    }
    await unlinkAyrshareSocial(profileKey, platform);
    return NextResponse.json({ ok: true, removed: [platform] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
