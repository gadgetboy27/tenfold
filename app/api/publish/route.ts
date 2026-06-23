import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publishSchema } from "@/lib/validation/schemas";
import {
  publishPhotoToFacebook,
  publishVideoToFacebook,
  publishPhotoToInstagram,
  publishVideoToInstagram,
} from "@/lib/social/meta";
import { ayrsharePost } from "@/lib/ayrshare/client";
import { getEntitlements } from "@/lib/billing/entitlements";
import { v4 as uuidv4 } from "uuid";

interface SocialProfile {
  platform: string;
  platform_page_id: string | null;
  platform_account_id: string | null;
  access_token: string;
  metadata?: {
    facebook_pages?: { id: string; name: string; access_token: string }[];
  } | null;
}

interface Asset {
  id: string;
  url: string;
  type: string;
}

async function publishToFacebook(
  profile: SocialProfile,
  asset: Asset,
  caption: string,
): Promise<string> {
  if (!profile.platform_page_id) throw new Error("Facebook Page ID not found");
  if (asset.type === "video") {
    return publishVideoToFacebook(
      profile.platform_page_id,
      profile.access_token,
      asset.url,
      caption,
    );
  }
  return publishPhotoToFacebook(
    profile.platform_page_id,
    profile.access_token,
    asset.url,
    caption,
  );
}

async function publishToInstagram(
  profile: SocialProfile,
  asset: Asset,
  caption: string,
): Promise<string> {
  const igUserId = profile.platform_account_id;
  if (!igUserId) throw new Error("Instagram account ID not found");
  if (asset.type === "video") {
    return publishVideoToInstagram(
      igUserId,
      profile.access_token,
      asset.url,
      caption,
    );
  }
  return publishPhotoToInstagram(
    igUserId,
    profile.access_token,
    asset.url,
    caption,
  );
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = publishSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // Resolve asset — prefer the composition's output, but fall back to the
    // direct assetId (the anchor) when the compositionId is stale/missing, so a
    // leftover compositionId never hard-blocks publishing.
    let asset: Asset | null = null;
    let resolvedCompositionId: string | null = null;

    if (body.compositionId) {
      const { data: composition } = await admin
        .from("compositions")
        .select("output_asset_id, anchor_asset_id")
        .eq("id", body.compositionId)
        .eq("workspace_id", session.workspaceId)
        .single();
      if (composition) {
        resolvedCompositionId = body.compositionId;
        const comp = composition as {
          output_asset_id: string | null;
          anchor_asset_id: string;
        };
        const { data: a } = await admin
          .from("assets")
          .select("id, url, type")
          .eq("id", comp.output_asset_id ?? comp.anchor_asset_id)
          .single();
        asset = a as Asset | null;
      }
    }

    if (!asset && body.assetId) {
      const { data: a } = await admin
        .from("assets")
        .select("id, url, type")
        .eq("id", body.assetId)
        .eq("workspace_id", session.workspaceId)
        .single();
      asset = a as Asset | null;
    }

    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    // Load connected profiles for requested platforms
    const { data: profiles } = await admin
      .from("social_profiles")
      .select(
        "platform, platform_page_id, platform_account_id, access_token, metadata",
      )
      .eq("workspace_id", session.workspaceId)
      .in("platform", body.platforms);

    // Two publishing backends:
    //  • Facebook + Instagram → Meta Graph directly (free, all tiers) when the
    //    workspace has connected that account here.
    //  • Every other network → Ayrshare (Pro feature; uses the workspace's
    //    Ayrshare profile key + its linked socials).
    const metaByPlatform = new Map<string, SocialProfile>(
      (profiles ?? []).map((p) => [
        (p as SocialProfile).platform,
        p as SocialProfile,
      ]),
    );

    const { data: ws } = await admin
      .from("workspaces")
      .select("ayrshare_profile_key")
      .eq("id", session.workspaceId)
      .single();
    const ayrshareKey =
      (ws as { ayrshare_profile_key: string | null } | null)
        ?.ayrshare_profile_key ?? null;
    const ent = await getEntitlements(session.workspaceId);

    const hashtags = body.hashtags.map((h) =>
      h.startsWith("#") ? h : `#${h}`,
    );
    const fullCaption = hashtags.length
      ? `${body.caption}\n\n${hashtags.join(" ")}`
      : body.caption;

    const platformResults: Record<string, string> = {};
    const errors: Record<string, string> = {};

    for (const platform of body.platforms) {
      // Per-platform AI caption when supplied (its hashtags are already tailored);
      // otherwise the base caption + shared hashtags.
      const platformCaption = body.platformCaptions?.[platform] ?? fullCaption;
      try {
        const meta = metaByPlatform.get(platform);
        let postId: string;
        if (platform === "facebook" && meta) {
          // Per-publish Page override: resolve the chosen Page's id + token from
          // the stored managed-pages list. Falls back to the active page when no
          // facebookPageId is sent (backward compatible).
          let fbProfile = meta;
          if (body.facebookPageId) {
            const pages = meta.metadata?.facebook_pages ?? [];
            const chosen = pages.find((p) => p.id === body.facebookPageId);
            if (!chosen) {
              errors.facebook =
                "Selected Facebook Page not found — reconnect Facebook in Settings.";
              continue;
            }
            fbProfile = {
              ...meta,
              platform_page_id: chosen.id,
              access_token: chosen.access_token,
            };
          }
          postId = await publishToFacebook(fbProfile, asset, platformCaption);
        } else if (platform === "instagram" && meta) {
          postId = await publishToInstagram(meta, asset, platformCaption);
        } else {
          // Everything else goes through Ayrshare (Pro).
          if (!ent.isPro) {
            errors[platform] =
              "Publishing beyond Facebook & Instagram is a Pro feature — upgrade to reach this network.";
            continue;
          }
          if (!ayrshareKey) {
            errors[platform] =
              "Connect your accounts in Settings → Social first.";
            continue;
          }
          const result = await ayrsharePost(ayrshareKey, {
            post: platformCaption,
            platforms: [platform],
            mediaUrls: [asset.url],
            ...(body.scheduledAt ? { scheduleDate: body.scheduledAt } : {}),
          });
          postId = result.postIds?.[0]?.id ?? result.id ?? "posted";
        }
        platformResults[platform] = postId;
      } catch (err) {
        errors[platform] = err instanceof Error ? err.message : "Unknown error";
      }
    }

    if (Object.keys(platformResults).length === 0) {
      return NextResponse.json(
        { error: "All platforms failed to publish", errors },
        { status: 500 },
      );
    }

    const isScheduled = !!body.scheduledAt;
    const { data: record } = await admin
      .from("publish_records")
      .insert({
        id: uuidv4(),
        composition_id: resolvedCompositionId,
        workspace_id: session.workspaceId,
        platforms: body.platforms,
        caption: body.caption,
        hashtags: body.hashtags,
        scheduled_at: isScheduled ? body.scheduledAt : null,
        published_at: isScheduled ? null : new Date().toISOString(),
        status: isScheduled ? "scheduled" : "published",
        platform_results: platformResults as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    if (resolvedCompositionId) {
      await admin
        .from("compositions")
        .update({ status: "published" })
        .eq("id", resolvedCompositionId);
    }

    return NextResponse.json(
      {
        record,
        platformResults,
        errors: Object.keys(errors).length ? errors : undefined,
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized"
        ? 401
        : msg === "Not a workspace member"
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
