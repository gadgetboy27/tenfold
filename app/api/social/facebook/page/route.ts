import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { z } from "zod";
import { canManageConnections, CONNECTION_FORBIDDEN } from "@/lib/social/authz";
import { recordSocialEvent } from "@/lib/social/audit";
import {
  encryptProfileTokens,
  decryptProfileTokens,
} from "@/lib/social/token-crypto";
import { getInstagramAccount } from "@/lib/social/meta";

const schema = z.object({ pageId: z.string().min(1) });

interface StoredPage {
  id: string;
  name: string;
  access_token: string;
}

// POST /api/social/facebook/page — switch which Facebook Page PrettyMuch publishes
// to. All managed pages (with permanent tokens) were saved at connect time in
// social_profiles.metadata, so switching needs no re-auth.
export const POST = withWorkspace(async (req, { db, admin, session }) => {
  // Switching the Page IS the attack lib/social/authz.ts was written to
  // stop — "repoint the workspace's Facebook at a Page they own" — and this
  // route was the one that shipped without the gate. It needs no re-auth and
  // silently re-points every future post, so it is at least as powerful as
  // connecting, and it can drop the Instagram connection outright below.
  if (!canManageConnections(session)) {
    return NextResponse.json(CONNECTION_FORBIDDEN, { status: 403 });
  }
  const { pageId } = schema.parse(await req.json());

  const { data: row } = await db
    .from("social_profiles")
    .select("metadata")
    .eq("platform", "facebook")
    .single();

  // The stored Page tokens are used to call Graph below and are re-saved as
  // the active credential, so they have to come back out in the clear.
  const decrypted = row
    ? decryptProfileTokens(row as { metadata?: unknown })
    : null;
  const pages =
    (decrypted as { metadata?: { facebook_pages?: StoredPage[] } } | null)
      ?.metadata?.facebook_pages ?? [];
  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    return NextResponse.json(
      { error: "Page not found — reconnect Facebook." },
      { status: 400 },
    );
  }

  await db
    .from("social_profiles")
    .update(
      encryptProfileTokens({
        handle: page.id,
        profile_display_name: page.name,
        platform_page_id: page.id,
        access_token: page.access_token,
      }),
    )
    .eq("platform", "facebook");

  // Re-sync the linked Instagram account for the new page (or remove it).
  const ig = await getInstagramAccount(page.id, page.access_token);
  if (ig) {
    await db.from("social_profiles").upsert(
      encryptProfileTokens({
        workspace_id: session.workspaceId,
        platform: "instagram",
        handle: ig.username,
        profile_display_name: ig.name ?? ig.username,
        platform_page_id: page.id,
        platform_account_id: ig.id,
        access_token: page.access_token,
        connected_at: new Date().toISOString(),
      }),
      { onConflict: "workspace_id,platform" },
    );
  } else {
    await db.from("social_profiles").delete().eq("platform", "instagram");
  }

  // `page_switched` has existed in the SocialAction union since the audit
  // log was written and was never emitted by anything — this is the route it
  // was named for. Where a business's posts land changing is exactly the
  // event someone reads this log to find.
  await recordSocialEvent(
    admin,
    { workspaceId: session.workspaceId, userId: session.userId },
    "facebook",
    "page_switched",
    { target: page.id },
  );

  return NextResponse.json({
    ok: true,
    page: { id: page.id, name: page.name },
    instagram: ig?.username ?? null,
  });
});
