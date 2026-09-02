import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getConnectedPlatforms } from "@/lib/ayrshare/profiles";
import { isDirectPlatform } from "@/lib/social/direct";
import { isAyrshareEnabled } from "@/lib/ayrshare/enabled";
import { configuredPlatforms } from "@/lib/social/configured";

interface OutProfile {
  id: string;
  platform: string;
  handle: string | null;
  profile_display_name: string | null;
  connected_at: string | null;
  source: "native" | "direct" | "ayrshare";
  activePageId?: string | null;
  availablePages?: { id: string; name: string }[];
  // Direct-backend destination (Reddit subreddit / Pinterest board), so the
  // settings UI can show what a post would actually go to — and flag the
  // connections that can't publish yet because nothing is chosen.
  destination?: { label: string; value: string | null } | null;
  availableBoards?: { id: string; name: string }[];
}

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data: profiles } = await admin
      .from("social_profiles")
      .select(
        "id, platform, handle, profile_display_name, platform_page_id, metadata, connected_at",
      )
      .eq("workspace_id", session.workspaceId);

    // For Facebook, surface the managed-page list (id + name only — never tokens)
    // and which page is active, so the UI can render the Page picker.
    const out: OutProfile[] = (profiles ?? []).map((p): OutProfile => {
      const row = p as {
        id: string;
        platform: string;
        handle: string | null;
        profile_display_name: string | null;
        platform_page_id: string | null;
        metadata: {
          facebook_pages?: { id: string; name: string }[];
          default_subreddit?: string;
          default_board_id?: string;
          pinterest_boards?: { id: string; name: string }[];
        } | null;
        connected_at: string | null;
      };
      const base: OutProfile = {
        id: row.id,
        platform: row.platform,
        handle: row.handle,
        profile_display_name: row.profile_display_name,
        connected_at: row.connected_at,
        source: isDirectPlatform(row.platform) ? "direct" : "native",
      };
      if (row.platform === "facebook" && row.metadata?.facebook_pages?.length) {
        return {
          ...base,
          activePageId: row.platform_page_id,
          availablePages: row.metadata.facebook_pages.map((fp) => ({
            id: fp.id,
            name: fp.name,
          })),
        };
      }
      if (row.platform === "reddit") {
        const sub = row.metadata?.default_subreddit ?? null;
        return {
          ...base,
          destination: { label: "Subreddit", value: sub ? `r/${sub}` : null },
        };
      }
      if (row.platform === "pinterest") {
        const boards = row.metadata?.pinterest_boards ?? [];
        const activeId = row.metadata?.default_board_id ?? null;
        return {
          ...base,
          destination: {
            label: "Board",
            value: boards.find((b) => b.id === activeId)?.name ?? null,
          },
          availableBoards: boards,
        };
      }
      return base;
    });

    // Merge in platforms linked through Ayrshare's hosted flow. Those live in
    // Ayrshare, not social_profiles, so without this they'd be invisible in
    // Tenfold — leaving users unsure whether the connection actually took (the
    // "did it connect or not?" limbo). Meta platforms stay native (richer data +
    // Page picker); only add Ayrshare platforms the local table doesn't cover.
    const { data: workspace } = await admin
      .from("workspaces")
      .select("ayrshare_profile_key")
      .eq("id", session.workspaceId)
      .single();
    const profileKey = (
      workspace as { ayrshare_profile_key: string | null } | null
    )?.ayrshare_profile_key;

    // Skip the Ayrshare round-trip entirely when the integration is switched
    // off — otherwise every settings page load pays a network call to a service
    // we're no longer publishing through, and surfaces stale "connected" chips
    // for networks that would now be rejected at publish time.
    if (profileKey && process.env.AYRSHARE_ENABLED === "true") {
      try {
        const nativePlatforms = new Set(out.map((p) => p.platform));
        const ayrsharePlatforms = await getConnectedPlatforms(profileKey);
        for (const platform of ayrsharePlatforms) {
          if (nativePlatforms.has(platform)) continue;
          out.push({
            id: `ayrshare-${platform}`,
            platform,
            handle: null,
            profile_display_name: null,
            connected_at: null,
            source: "ayrshare",
          });
        }
      } catch {
        // Ayrshare unreachable — still return native connections rather than 500.
      }
    }

    // The client cannot read AYRSHARE_ENABLED (server-only), so it had no way
    // to know the hosted linking flow is switched off — and kept offering a
    // "Connect your socials" button whose only possible outcome was an error
    // toast. Ship the flag with the profiles so the UI can simply not offer it.
    //
    // Sent as a field rather than deleting the UI, because §7d is explicit that
    // the Ayrshare path stays whole and comes back with one env var.
    return NextResponse.json({
      profiles: out,
      ayrshareEnabled: isAyrshareEnabled(),
      // Same reasoning as the flag above: the client cannot read env, so it
      // was guessing at readiness from a checklist the user ticked themselves.
      configuredPlatforms: configuredPlatforms(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
