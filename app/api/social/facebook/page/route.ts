import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getInstagramAccount } from "@/lib/social/meta";

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

    await admin
      .from("social_profiles")
      .update({
        handle: page.id,
        profile_display_name: page.name,
        platform_page_id: page.id,
        access_token: page.access_token,
      })
      .eq("workspace_id", session.workspaceId)
      .eq("platform", "facebook");

    // Re-sync the linked Instagram account for the new page (or remove it).
    const ig = await getInstagramAccount(page.id, page.access_token);
    if (ig) {
      await admin.from("social_profiles").upsert(
        {
          workspace_id: session.workspaceId,
          platform: "instagram",
          handle: ig.username,
          profile_display_name: ig.name ?? ig.username,
          platform_page_id: page.id,
          platform_account_id: ig.id,
          access_token: page.access_token,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,platform" },
      );
    } else {
      await admin
        .from("social_profiles")
        .delete()
        .eq("workspace_id", session.workspaceId)
        .eq("platform", "instagram");
    }

    return NextResponse.json({
      ok: true,
      page: { id: page.id, name: page.name },
      instagram: ig?.username ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
