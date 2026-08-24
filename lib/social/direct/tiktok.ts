const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_API = "https://open.tiktokapis.com/v2";

/**
 * NOT verified against the live API — same position as the LinkedIn adapter.
 * Creating the TikTok app and clearing its audit is the user's step, so there
 * were no credentials to verify with. Shapes follow TikTok's published Content
 * Posting API contract; the first real publish is what proves them.
 *
 * TWO GATES BEYOND CREDENTIALS, both outside our control:
 *
 * 1. **App audit.** An unaudited app may only post with `privacy_level:
 *    SELF_ONLY` — the video lands on the account visible to nobody else. Public
 *    posting requires TikTok to audit the app. This is why TikTok was on
 *    Ayrshare: the access is the expensive part, not the code.
 *
 * 2. **URL ownership verification.** PULL_FROM_URL only accepts media on a
 *    domain verified in the TikTok developer portal. Our assets are served from
 *    Supabase Storage, so THAT host has to be the verified one — or the pull
 *    fails with an unhelpful error that looks like a bad URL.
 */

/** TikTok truncates hard; sending more just loses the tail silently. */
const MAX_TITLE = 2200;

/**
 * Unaudited apps are restricted to SELF_ONLY. Defaulting to it means a fresh
 * app posts successfully but privately, which is a comprehensible outcome —
 * rather than defaulting to PUBLIC and failing with a permissions error that
 * reads like a bug in our code.
 */
export type TikTokPrivacy =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

const DEFAULT_PRIVACY: TikTokPrivacy = "SELF_ONLY";

export function getTikTokOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    response_type: "code",
    // video.publish is direct-post; video.upload would only reach the user's
    // drafts inbox. user.info.basic yields the open_id we author as.
    scope: "user.info.basic,video.publish",
    redirect_uri: `${process.env.APP_URL}/api/social/callback/tiktok`,
    state,
  });
  return `${TIKTOK_AUTH}?${params}`;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  openId: string | null;
}

async function tokenRequest(body: URLSearchParams): Promise<TikTokTokens> {
  const res = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? "TikTok token exchange failed",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    // TikTok access tokens are short (24h); the refresh token is what keeps a
    // connection alive, so its absence is worth noticing at connect time.
    expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    openId: data.open_id ?? null,
  };
}

export async function exchangeTikTokCode(
  code: string,
): Promise<TikTokTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.APP_URL}/api/social/callback/tiktok`,
    }),
  );
}

export async function refreshTikTokToken(
  refreshToken: string,
): Promise<TikTokTokens> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
  // Same rule as Reddit and LinkedIn: never drop the token we already hold.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

export async function getTikTokDisplayName(
  accessToken: string,
): Promise<string | null> {
  const res = await fetch(
    `${TIKTOK_API}/user/info/?fields=open_id,display_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = (await res.json().catch(() => ({}))) as {
    data?: { user?: { display_name?: string } };
  };
  // A missing display name is cosmetic — the connection still works, so this
  // never throws and blocks an otherwise good OAuth round-trip.
  if (!res.ok) return null;
  return data.data?.user?.display_name ?? null;
}

/**
 * Publish a video by having TikTok pull it from our public Storage URL.
 *
 * PULL_FROM_URL rather than a chunked upload: our assets are already on a
 * public HTTPS host, so handing TikTok the URL avoids streaming the file
 * through our server twice. The cost is the domain-verification gate above.
 *
 * Returns the publish_id. Note this is ASYNCHRONOUS on TikTok's side — the id
 * means "accepted for processing", not "live". checkTikTokStatus polls it.
 */
export async function publishToTikTok(params: {
  accessToken: string;
  mediaUrl: string;
  isVideo: boolean;
  caption: string;
  privacy?: TikTokPrivacy;
}): Promise<{ publishId: string }> {
  if (!params.isVideo) {
    // TikTok photo posts go through /post/publish/content/init/ with its own
    // payload shape, which isn't built. Refusing beats silently posting
    // nothing, and beats pretending an image became a video.
    throw new Error(
      "TikTok needs a video — make one from this image first, then publish.",
    );
  }

  const res = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: params.caption.slice(0, MAX_TITLE),
        privacy_level: params.privacy ?? DEFAULT_PRIVACY,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: params.mediaUrl,
      },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string };
  };

  // TikTok reports failures inside a 200 as often as by status code — the same
  // trap Reddit sets (see reddit.ts). `res.ok` alone is not success.
  const code = data.error?.code;
  if (!res.ok || (code && code !== "ok") || !data.data?.publish_id) {
    throw new Error(
      data.error?.message ?? `TikTok rejected the post (${res.status})`,
    );
  }
  return { publishId: data.data.publish_id };
}

/** Ask TikTok what became of a publish_id. Not polled automatically — exposed
 *  so a caller can surface "still processing" rather than implying it's live. */
export async function checkTikTokStatus(
  accessToken: string,
  publishId: string,
): Promise<string | null> {
  const res = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { status?: string };
  };
  return data.data?.status ?? null;
}
