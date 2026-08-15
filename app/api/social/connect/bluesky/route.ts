import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyBlueskyCredentials } from "@/lib/social/direct/bluesky";
import { errorMessage } from "@/lib/api/error-message";

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
      {
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
      },
      { onConflict: "workspace_id,platform" },
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, handle });
  } catch (err) {
    const msg = errorMessage(err, "Could not connect Bluesky");
    const status = msg === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
