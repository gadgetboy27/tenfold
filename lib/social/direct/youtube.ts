const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD = "https://www.googleapis.com/upload/youtube/v3";

/**
 * NOT verified against the live API — same position as the LinkedIn and TikTok
 * adapters. The Google Cloud project and its OAuth consent screen are the
 * user's step.
 *
 * THE GATE: `youtube.upload` is a **restricted** Google scope. An unverified
 * app can only authorise accounts explicitly added as test users, and each
 * consent shows an "unverified app" warning. Publishing for real customers
 * needs Google's OAuth verification, which for a restricted scope means a
 * security review. That review is precisely why YouTube sat on Ayrshare.
 *
 * Also worth knowing: uploads consume ~1600 units of a default 10,000/day
 * quota, so roughly six videos a day per project until you request more.
 */

/** YouTube's own limits — exceeding either is a 400, not a truncation. */
const MAX_TITLE = 100;
const MAX_DESCRIPTION = 5000;

export function getYouTubeOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    redirect_uri: `${process.env.APP_URL}/api/social/callback/youtube`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload",
    state,
    // Google only issues a refresh token with access_type=offline, and only on
    // the FIRST consent unless prompt=consent forces it. Without both, the
    // connection dies in an hour and cannot be revived without the user
    // manually revoking access first — a genuinely baffling failure mode.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH}?${params}`;
}

export interface YouTubeTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

async function tokenRequest(body: URLSearchParams): Promise<YouTubeTokens> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? "Google token exchange failed",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

export async function exchangeYouTubeCode(
  code: string,
): Promise<YouTubeTokens> {
  return tokenRequest(
    new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: `${process.env.APP_URL}/api/social/callback/youtube`,
      grant_type: "authorization_code",
    }),
  );
}

/** Google access tokens last an hour, so this runs on most publishes. */
export async function refreshYouTubeToken(
  refreshToken: string,
): Promise<YouTubeTokens> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  );
  // A Google refresh response never echoes the refresh token back.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

export async function getYouTubeChannel(
  accessToken: string,
): Promise<{ id: string | null; title: string | null }> {
  const res = await fetch(
    `${YOUTUBE_API}/channels?part=snippet&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = (await res.json().catch(() => ({}))) as {
    items?: { id?: string; snippet?: { title?: string } }[];
  };
  // The upload scope alone may not permit reading channels. Treat a failure as
  // cosmetic rather than blocking an otherwise valid connection.
  if (!res.ok) return { id: null, title: null };
  const first = data.items?.[0];
  return { id: first?.id ?? null, title: first?.snippet?.title ?? null };
}

/**
 * Upload a video via Google's resumable protocol.
 *
 * Two steps: POST the metadata to get a session URL, then PUT the bytes to it.
 * Resumable rather than a single multipart POST because that is what Google
 * recommends for anything non-trivial, and our composed clips are megabytes.
 *
 * The whole file is buffered in memory before the PUT. That is fine for the
 * short-form clips this product makes (10-30s) and would not be for long
 * uploads — a real streaming pipe would be the fix if that ever changes.
 */
export async function publishToYouTube(params: {
  accessToken: string;
  mediaUrl: string;
  isVideo: boolean;
  caption: string;
  privacy?: "public" | "unlisted" | "private";
}): Promise<{ id: string }> {
  if (!params.isVideo) {
    throw new Error(
      "YouTube only accepts video — make a video from this image first, then publish.",
    );
  }

  // First line is the title, the rest the description: the same split Pinterest
  // uses, and it matches how the caption is actually written (hook, then body).
  const [firstLine, ...rest] = params.caption.split("\n");
  const title = (firstLine.trim() || "Untitled").slice(0, MAX_TITLE);
  const description = rest.join("\n").trim().slice(0, MAX_DESCRIPTION);

  const init = await fetch(
    `${YOUTUBE_UPLOAD}/videos?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        snippet: { title, description },
        status: {
          // Unlisted by default. An unverified app posting PUBLIC to someone's
          // real channel is not a default anyone should inherit by accident.
          privacyStatus: params.privacy ?? "unlisted",
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );

  if (!init.ok) {
    const body = (await init.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      body.error?.message ?? `YouTube would not start the upload (${init.status})`,
    );
  }

  // The session URL comes back in a header, not the body.
  const sessionUrl = init.headers.get("location");
  if (!sessionUrl) throw new Error("YouTube did not return an upload session");

  const source = await fetch(params.mediaUrl);
  if (!source.ok) throw new Error("Could not read the video to upload");
  const bytes = await source.arrayBuffer();

  const put = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": source.headers.get("content-type") ?? "video/mp4",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });

  const result = (await put.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!put.ok || !result.id) {
    throw new Error(
      result.error?.message ?? `YouTube rejected the upload (${put.status})`,
    );
  }
  return { id: result.id };
}
