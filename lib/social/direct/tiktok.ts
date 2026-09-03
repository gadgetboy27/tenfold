import { canonicalMediaUrl } from "@/lib/social/media-url";

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

export async function exchangeTikTokCode(code: string): Promise<TikTokTokens> {
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
 * What this account is actually allowed to post right now.
 *
 * TikTok expects `creator_info` to be queried before a post, and it is the
 * only way to know two things we otherwise guess at:
 *
 *  - `privacy_level_options` — which privacy levels this creator may use. An
 *    unaudited app gets SELF_ONLY only, but a private account restricts them
 *    too, so the allowed set is a property of the ACCOUNT, not just our audit
 *    state. Sending a level that isn't in this list is rejected.
 *  - `max_video_post_duration_sec` — a real per-account ceiling. Posting a
 *    clip longer than it fails during TikTok's processing, i.e. AFTER we have
 *    already told the user it published.
 *
 * Returns null when the query fails. A creator_info outage must not be the
 * thing that stops someone posting — the publish below then proceeds on the
 * SELF_ONLY default, which is the safe end of the range.
 */
export interface TikTokCreatorInfo {
  nickname: string | null;
  privacyOptions: TikTokPrivacy[];
  maxDurationSec: number | null;
  /**
   * The creator's own interaction settings.
   *
   * TikTok's content-sharing guidelines require these to be RESPECTED, not
   * overridden: re-enabling comments on an account that has switched them off
   * is a violation, and the API rejects the post for it. The rejection cites
   * the guidelines URL and names nothing specific, which is why this cost an
   * afternoon.
   */
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
}

export async function getTikTokCreatorInfo(
  accessToken: string,
): Promise<TikTokCreatorInfo | null> {
  try {
    const res = await fetch(`${TIKTOK_API}/post/publish/creator_info/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: {
        creator_nickname?: string;
        privacy_level_options?: string[];
        max_video_post_duration_sec?: number;
        comment_disabled?: boolean;
        duet_disabled?: boolean;
        stitch_disabled?: boolean;
      };
      error?: { code?: string; message?: string };
    };
    const code = data.error?.code;
    if (!res.ok || (code && code !== "ok")) return null;
    return {
      nickname: data.data?.creator_nickname ?? null,
      privacyOptions: (data.data?.privacy_level_options ??
        []) as TikTokPrivacy[],
      maxDurationSec: data.data?.max_video_post_duration_sec ?? null,
      // Absent means "not disabled" — but see interactionFlags below, which
      // never widens what the creator allows.
      commentDisabled: data.data?.comment_disabled === true,
      duetDisabled: data.data?.duet_disabled === true,
      stitchDisabled: data.data?.stitch_disabled === true,
    };
  } catch {
    return null;
  }
}

/**
 * The privacy level to actually send.
 *
 * Prefers what the caller asked for, falls back to SELF_ONLY, and will only
 * send a level TikTok has said this creator may use. Asking for PUBLIC on an
 * unaudited app is the single most likely mistake here, and this turns it into
 * a private post rather than a rejected one.
 */
export function resolvePrivacy(
  requested: TikTokPrivacy | undefined,
  info: TikTokCreatorInfo | null,
): TikTokPrivacy {
  const want = requested ?? DEFAULT_PRIVACY;
  // No creator_info (query failed) — send the conservative default, which is
  // the one level every app may use.
  if (!info || info.privacyOptions.length === 0) return want;
  if (info.privacyOptions.includes(want)) return want;
  if (info.privacyOptions.includes(DEFAULT_PRIVACY)) return DEFAULT_PRIVACY;
  return info.privacyOptions[0];
}

/**
 * What to send for disable_comment / disable_duet / disable_stitch.
 *
 * Two rules, and we had neither — the adapter hardcoded all three to `false`,
 * which is the one combination guaranteed to be wrong somewhere:
 *
 *  1. NEVER RE-ENABLE WHAT THE CREATOR TURNED OFF. Sending
 *     `disable_comment: false` to an account that disabled comments asks
 *     TikTok to override the account owner. It refuses, citing the
 *     content-sharing guidelines and naming nothing specific.
 *
 *  2. A PRIVATE VIDEO CANNOT BE DUETTED OR STITCHED. Those need a video other
 *     people can see, so `SELF_ONLY` plus `disable_duet: false` is a
 *     contradiction — and an unaudited app posts SELF_ONLY every time, which
 *     is why this failed on the very first publish rather than eventually.
 *
 * With no creator_info (the query failed), everything is disabled: the
 * restrictive choice is the safe one, because it can only ever ask for LESS
 * than the creator permits.
 */
export function interactionFlags(
  info: TikTokCreatorInfo | null,
  privacy: TikTokPrivacy,
): {
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
} {
  const isPrivate = privacy === "SELF_ONLY";
  if (!info) {
    return {
      disable_comment: true,
      disable_duet: true,
      disable_stitch: true,
    };
  }
  return {
    disable_comment: info.commentDisabled,
    disable_duet: info.duetDisabled || isPrivate,
    disable_stitch: info.stitchDisabled || isPrivate,
  };
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
}): Promise<{ publishId: string; privacy: TikTokPrivacy }> {
  if (!params.isVideo) {
    // TikTok photo posts go through /post/publish/content/init/ with its own
    // payload shape, which isn't built. Refusing beats silently posting
    // nothing, and beats pretending an image became a video.
    throw new Error(
      "TikTok needs a video — make one from this image first, then publish.",
    );
  }

  // Ask what this account may do before telling it what to do.
  const info = await getTikTokCreatorInfo(params.accessToken);
  const privacy = resolvePrivacy(params.privacy, info);

  // PULL_FROM_URL only accepts a domain verified in TikTok's portal, and 302
  // of this project's assets predate the custom domain — see media-url.ts.
  const videoUrl = canonicalMediaUrl(params.mediaUrl);

  const res = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: params.caption.slice(0, MAX_TITLE),
        privacy_level: privacy,
        ...interactionFlags(info, privacy),
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
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
    const raw = data.error?.message ?? "";
    // TikTok answers a compliance rejection with nothing but a link to its
    // guidelines. That names no cause, so translate it into the things it
    // actually is for us, in the order they are worth checking.
    const vague = /content-sharing-guidelines|integration guidelines/i.test(
      raw,
    );
    throw new Error(
      vague
        ? "TikTok refused the post under its sharing guidelines. The usual causes, in order: the app is unaudited so the post must be SELF_ONLY; the media domain isn't verified in the TikTok portal; or the post tried to re-enable comments/duet/stitch the creator has switched off."
        : raw || `TikTok rejected the post (${res.status})`,
    );
  }
  return { publishId: data.data.publish_id, privacy };
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

/**
 * Give TikTok a moment to reject the video before we call it published.
 *
 * `publish_id` means "accepted for processing". TikTok then fetches the file,
 * transcodes it, and can fail afterwards — an unverified domain, a clip past
 * the account's duration ceiling, an unsupported codec. None of that is known
 * at init time, so returning the id alone reports success for posts that never
 * appear, and the user finds out by looking at TikTok.
 *
 * A SHORT poll, not a full wait: a real publish can take minutes, and holding
 * an HTTP request open for that would time out the whole multi-platform
 * publish. A few seconds is enough to catch the deterministic failures — the
 * fetch and validation happen first — while a genuinely slow transcode still
 * returns "queued", which is honest.
 *
 * Returns the terminal status when it reached one, or null when it is still
 * processing. THROWS on an explicit failure, so the caller records an error
 * instead of a post id.
 */
export async function awaitTikTokAcceptance(
  accessToken: string,
  publishId: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<string | null> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 1500;
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((r) => setTimeout(r, delayMs));
    const status = await checkTikTokStatus(accessToken, publishId).catch(
      () => null,
    );
    if (!status) continue;
    // TikTok spells failure several ways across its statuses and error codes;
    // matching on FAIL catches them without pinning an exact enum we would
    // then have to chase.
    if (/FAIL/i.test(status)) {
      throw new Error(
        `TikTok rejected the video while processing (${status}). If this is a new app, check the media domain is verified in the TikTok portal.`,
      );
    }
    if (/COMPLETE|PUBLISH_OK/i.test(status)) return status;
  }
  return null;
}
