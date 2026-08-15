import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publishToBluesky } from "./bluesky";
import { publishToReddit, refreshRedditToken } from "./reddit";
import { publishToPinterest, refreshPinterestToken } from "./pinterest";

/**
 * The "direct" publishing backend: networks we reach with our own code and our
 * own (free, review-free) developer apps, as opposed to the Meta Graph backend
 * (lib/social/meta.ts) or the Ayrshare backend (lib/ayrshare/*).
 *
 * These three were chosen because none of them gates posting behind a platform
 * app review: Bluesky needs no developer app at all, Reddit and Pinterest need
 * one that is free and self-serve. X / LinkedIn / TikTok / YouTube stay on
 * Ayrshare precisely because their access is the part that costs money and
 * calendar time.
 */
export const DIRECT_PLATFORMS = ["bluesky", "reddit", "pinterest"] as const;

export type DirectPlatform = (typeof DIRECT_PLATFORMS)[number];

export function isDirectPlatform(platform: string): platform is DirectPlatform {
  return (DIRECT_PLATFORMS as readonly string[]).includes(platform);
}

/** Networks that can carry a video. Pinterest video needs the /v5/media upload
 *  flow, which isn't built — so a video publish there fails loudly here rather
 *  than posting a still and pretending it worked. */
const VIDEO_CAPABLE: Record<DirectPlatform, boolean> = {
  bluesky: true,
  reddit: true, // link post; Reddit unfurls the MP4 URL
  pinterest: false,
};

// Snake_case on purpose: this is the social_profiles row as Supabase returns
// it, passed straight through from the publish route rather than re-mapped.
export interface DirectProfile {
  platform: string;
  handle: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  platform_account_id: string | null;
  metadata?: {
    default_subreddit?: string;
    default_board_id?: string;
    pinterest_boards?: { id: string; name: string }[];
  } | null;
}

export interface DirectPublishParams {
  platform: DirectPlatform;
  profile: DirectProfile;
  workspaceId: string;
  mediaUrl: string;
  isVideo: boolean;
  caption: string;
  /** Per-publish overrides from the Publish UI, when the user picks something
   *  other than the connection's stored default. */
  subreddit?: string;
  boardId?: string;
}

// Refresh a little before the real expiry: a token that dies mid-publish
// surfaces as an opaque 401 the user can't act on.
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

function isExpired(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return false; // null = never expires (Bluesky app password)
  const at = Date.parse(tokenExpiresAt);
  // An unparseable timestamp shouldn't be read as "valid forever" — treat it as
  // spent so the refresh path runs rather than sending a probably-dead token.
  if (!Number.isFinite(at)) return true;
  return at - EXPIRY_SKEW_MS <= Date.now();
}

/**
 * Return a usable access token, refreshing and persisting first if the stored
 * one is spent. Persisting matters: Reddit tokens last an hour, so without
 * writing the new one back every publish would burn a refresh round-trip and
 * eventually hit Reddit's rate limit on the token endpoint.
 */
async function freshAccessToken(
  platform: DirectPlatform,
  profile: DirectProfile,
  workspaceId: string,
): Promise<string> {
  if (!profile.access_token) {
    throw new Error(`${platform} is not connected — reconnect it in Settings.`);
  }
  if (platform === "bluesky" || !isExpired(profile.token_expires_at)) {
    return profile.access_token;
  }
  if (!profile.refresh_token) {
    throw new Error(
      `Your ${platform} connection expired. Reconnect it in Settings → Social.`,
    );
  }

  const tokens =
    platform === "reddit"
      ? await refreshRedditToken(profile.refresh_token)
      : await refreshPinterestToken(profile.refresh_token);

  const admin = createSupabaseAdminClient();
  await admin
    .from("social_profiles")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: tokens.expiresAt.toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("platform", platform);

  return tokens.accessToken;
}

/**
 * Publish one asset to one direct-backend network. Throws with a
 * user-presentable message on failure — app/api/publish/route.ts catches per
 * platform and reports them individually, so one network failing never takes
 * the others down with it.
 */
export async function publishDirect(
  params: DirectPublishParams,
): Promise<string> {
  const { platform, profile, workspaceId, mediaUrl, isVideo, caption } = params;

  if (isVideo && !VIDEO_CAPABLE[platform]) {
    throw new Error(
      `${platform} can't post video yet — publish the image instead.`,
    );
  }

  if (platform === "bluesky") {
    // Bluesky stores the handle in `handle` and the app password in
    // `access_token`; there is no OAuth token to refresh.
    if (!profile.handle || !profile.access_token) {
      throw new Error("Reconnect Bluesky in Settings → Social.");
    }
    return publishToBluesky({
      identifier: profile.handle,
      appPassword: profile.access_token,
      mediaUrl,
      caption,
      isVideo,
    });
  }

  const accessToken = await freshAccessToken(platform, profile, workspaceId);

  if (platform === "reddit") {
    const subreddit = params.subreddit ?? profile.metadata?.default_subreddit;
    if (!subreddit) {
      throw new Error(
        "Pick a subreddit before posting to Reddit — set one in Settings → Social.",
      );
    }
    // Reddit takes a title, not a caption body. The caption's first line is
    // almost always the hook, and titles are immutable, so take that rather
    // than the whole multi-paragraph caption with its hashtag block.
    const title = caption.split("\n")[0].trim() || caption.trim();
    return publishToReddit({ accessToken, subreddit, title, mediaUrl });
  }

  const boardId = params.boardId ?? profile.metadata?.default_board_id;
  if (!boardId) {
    throw new Error(
      "Pick a Pinterest board before pinning — set one in Settings → Social.",
    );
  }
  const [firstLine, ...rest] = caption.split("\n");
  return publishToPinterest({
    accessToken,
    boardId,
    title: firstLine.trim() || "Untitled",
    description: rest.join("\n").trim() || caption,
    mediaUrl,
  });
}
