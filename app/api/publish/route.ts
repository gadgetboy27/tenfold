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
import { composeVideo } from "@/lib/composition/video";
import { pickForPlatform } from "@/lib/composition/formats";
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

// Recognise a video by type OR extension — the cinema mix saves as
// "composed_video" (not "video"), which was being posted as a photo (a still).
function isVideoAsset(asset: Asset): boolean {
  return (
    asset.type === "video" ||
    asset.type === "composed_video" ||
    asset.url.toLowerCase().split("?")[0].endsWith(".mp4")
  );
}

async function publishToFacebook(
  profile: SocialProfile,
  asset: Asset,
  caption: string,
): Promise<string> {
  if (!profile.platform_page_id) throw new Error("Facebook Page ID not found");
  if (isVideoAsset(asset)) {
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
  if (isVideoAsset(asset)) {
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
    // Fan-out exports tag each composed_video with its aspect; index them so
    // each platform can post the format that matches its placement.
    const assetsByAspect = new Map<string, Asset>();

    // "Publish the video": post the campaign's actual clip. Prefer an already
    // mixed video; otherwise mix the latest music onto the raw clip (so the post
    // has SOUND) and store that in Supabase — permanent even after the source
    // music URL expires. Falls back to the raw clip if there's no music or the
    // mix fails (e.g. the source music URL is already dead).
    if (body.preferVideo && body.campaignId) {
      const pick = (type: string, cols = "id, url, type") =>
        admin
          .from("assets")
          .select(cols)
          .eq("campaign_id", body.campaignId)
          .eq("workspace_id", session.workspaceId)
          .eq("type", type)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      // All fan-out formats for this campaign, newest-first, indexed by aspect
      // (first/newest wins per aspect). Untagged mixes just don't get indexed.
      const { data: composed } = await admin
        .from("assets")
        .select("id, url, type, metadata")
        .eq("campaign_id", body.campaignId)
        .eq("workspace_id", session.workspaceId)
        .eq("type", "composed_video")
        .order("created_at", { ascending: false });
      for (const row of composed ?? []) {
        const r = row as unknown as {
          id: string;
          url: string;
          type: string;
          metadata?: { aspect?: string } | null;
        };
        const asp = r.metadata?.aspect;
        if (asp && !assetsByAspect.has(asp)) {
          assetsByAspect.set(asp, { id: r.id, url: r.url, type: r.type });
        }
      }

      const { data: existing } = await pick("composed_video");
      if (existing) {
        asset = existing as unknown as Asset;
      } else {
        const { data: rawVideo } = await pick("video");
        const { data: music } = await pick("audio", "url");
        const rv = rawVideo as unknown as Asset | null;
        const mus = music as unknown as { url: string } | null;
        if (rv && mus) {
          try {
            const mix = await composeVideo({
              videoUrl: rv.url,
              audioUrl: mus.url,
              captionStyle: "none", // caption rides as the post text
              workspaceId: session.workspaceId,
              campaignId: body.campaignId,
            });
            const newId = uuidv4();
            await admin.from("assets").insert({
              id: newId,
              campaign_id: body.campaignId,
              workspace_id: session.workspaceId,
              type: "composed_video",
              url: mix.url,
              storage_path: mix.storagePath,
            });
            asset = { id: newId, url: mix.url, type: "composed_video" };
          } catch {
            asset = rv; // music expired / mix failed → publish the raw clip
          }
        } else {
          asset = rv;
        }
      }
    }

    if (!asset && body.compositionId) {
      const { data: composition } = await admin
        .from("compositions")
        .select("output_asset_id, anchor_asset_id")
        .eq("id", body.compositionId)
        .eq("workspace_id", session.workspaceId)
        .single();
      if (composition) {
        resolvedCompositionId = body.compositionId;
        // anchor_asset_id is nullable since migration 0015 (layered docs have no
        // image anchor), so the asset id can be null → fall through to assetId.
        const comp = composition as {
          output_asset_id: string | null;
          anchor_asset_id: string | null;
        };
        const assetRef = comp.output_asset_id ?? comp.anchor_asset_id;
        if (assetRef) {
          const { data: a } = await admin
            .from("assets")
            .select("id, url, type")
            .eq("id", assetRef)
            .single();
          asset = a as Asset | null;
        }
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
    const resolvedAsset = asset; // non-null fallback for every platform

    // The MP4 to post to a given platform: its format's fan-out render when one
    // exists, otherwise the single resolved asset (backward compatible).
    const assetForPlatform = (platform: string): Asset =>
      pickForPlatform(platform, assetsByAspect, resolvedAsset);

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
      const platformAsset = assetForPlatform(platform);
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
          postId = await publishToFacebook(
            fbProfile,
            platformAsset,
            platformCaption,
          );
        } else if (platform === "instagram" && meta) {
          postId = await publishToInstagram(
            meta,
            platformAsset,
            platformCaption,
          );
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
            mediaUrls: [platformAsset.url],
            ...(body.scheduledAt ? { scheduleDate: body.scheduledAt } : {}),
          });
          postId = result.postIds?.[0]?.id ?? result.id ?? "posted";
        }
        platformResults[platform] = postId;
      } catch (err) {
        errors[platform] = err instanceof Error ? err.message : "Unknown error";
        // Surface the real reason server-side — the client only shows a generic
        // failure, so without this the actual cause (bad token, media, etc.) is
        // invisible.
        console.error(`[publish] ${platform} failed:`, errors[platform]);
      }
    }

    if (Object.keys(platformResults).length === 0) {
      // Return the per-platform reasons so the UI can show WHY each failed
      // (Pro-gate vs auth vs media) instead of a single generic message.
      return NextResponse.json(
        {
          error: "All platforms failed to publish",
          errors,
          message: Object.entries(errors)
            .map(([p, m]) => `${p}: ${m}`)
            .join(" · "),
        },
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
