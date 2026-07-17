import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getInstagramAccount } from "@/lib/social/meta";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";

const schema = z.object({ pageId: z.string().min(1) });

interface StoredPage {
  id: string;
  name: string;
  access_token: string;
}

// POST /api/social/facebook/page — switch which Facebook Page tenfold publishes
// to. All managed pages (with permanent tokens) were saved at connect time in
// social_profiles.metadata, so switching needs no re-auth.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const { pageId } = schema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const { data: row } = await admin
      .from("social_profiles")
      .select("metadata")
      .eq("workspace_id", session.workspaceId)
      .eq("platform", "facebook")
      .single();

    const pages =
      (row as { metadata?: { facebook_pages?: StoredPage[] } } | null)?.metadata
        ?.facebook_pages ?? [];
    const page = pages.find((p) => p.id === pageId);
    if (!page) {
      return NextResponse.json(
        { error: "Page not found — reconnect Facebook." },
        { status: 400 },
      );
    }

    // The stored page token is encrypted; decrypt once for the Graph calls
    // below, and write it back encrypted. Legacy plaintext rows pass through
    // decryptToken untouched and get encrypted here on their next switch.
    const pageToken = decryptToken(page.access_token);

    await admin
      .from("social_profiles")
      .update({
        handle: page.id,
        profile_display_name: page.name,
        platform_page_id: page.id,
        access_token: encryptToken(pageToken),
      })
      .eq("workspace_id", session.workspaceId)
      .eq("platform", "facebook");

    // Re-sync the linked Instagram account for the new page (or remove it).
    const ig = await getInstagramAccount(page.id, pageToken);
    if (ig.account) {
      await admin.from("social_profiles").upsert(
        {
          workspace_id: session.workspaceId,
          platform: "instagram",
          handle: ig.account.username,
          profile_display_name: ig.account.name ?? ig.account.username,
          platform_page_id: page.id,
          platform_account_id: ig.account.id,
          access_token: encryptToken(pageToken),
          connected_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,platform" },
      );
    } else if (ig.reason === "not_linked") {
      // The new Page genuinely has no Instagram attached, so the old row is
      // stale — drop it. Deliberately NOT on graph_error: a transient API
      // failure must not disconnect a working Instagram account.
      await admin
        .from("social_profiles")
        .delete()
        .eq("workspace_id", session.workspaceId)
        .eq("platform", "instagram");
    }

    return NextResponse.json({
      ok: true,
      page: { id: page.id, name: page.name },
      instagram: ig.account?.username ?? null,
      // Why there's no Instagram, so the picker can say so instead of just
      // showing nothing.
      instagramReason: ig.account ? null : ig.reason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
