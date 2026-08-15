const REDDIT_OAUTH = "https://oauth.reddit.com";
const REDDIT_WWW = "https://www.reddit.com";

// Reddit blocks requests with a generic or absent User-Agent (429s that look
// like rate limits but never clear). Their guidance is platform:id:version by
// author — send it on every call, unauthenticated ones included.
const USER_AGENT = "web:nz.prettymuch.publisher:v1.0 (by /u/prettymuch)";

// A Reddit submission needs a TITLE, not a caption — it's the whole post, and
// it's immutable once posted. Captions written for Instagram run long, so they
// get truncated at Reddit's real limit rather than rejected.
const MAX_TITLE = 300;

export function getRedditOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.REDDIT_CLIENT_ID!,
    response_type: "code",
    state,
    redirect_uri: `${process.env.APP_URL}/api/social/callback/reddit`,
    // "permanent" is what yields a refresh_token; without it the connection
    // silently dies an hour after the user links it.
    duration: "permanent",
    scope: "identity submit read",
  });
  return `${REDDIT_WWW}/api/v1/authorize?${params}`;
}

function basicAuthHeader(): string {
  const creds = `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

export interface RedditTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

async function tokenRequest(body: URLSearchParams): Promise<RedditTokens> {
  const res = await fetch(`${REDDIT_WWW}/api/v1/access_token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? "Reddit token exchange failed");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

export async function exchangeRedditCode(code: string): Promise<RedditTokens> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.APP_URL}/api/social/callback/reddit`,
    }),
  );
}

/** Reddit access tokens live one hour, so this runs on most publishes. */
export async function refreshRedditToken(
  refreshToken: string,
): Promise<RedditTokens> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
  // A refresh response omits refresh_token — keep the one we already hold, or
  // the next refresh has nothing to present and the connection dies.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

export async function getRedditUsername(accessToken: string): Promise<string> {
  const res = await fetch(`${REDDIT_OAUTH}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    },
  });
  const data = (await res.json()) as { name?: string };
  if (!res.ok || !data.name) throw new Error("Could not read Reddit identity");
  return data.name;
}

/**
 * Submit a link post pointing at the asset's public Storage URL.
 *
 * Deliberately `kind=link` rather than a native image upload: a native image
 * post needs Reddit's media-asset lease dance (asset.json → presigned S3 PUT →
 * poll for the processed asset), which is several more failure modes for a
 * result that renders near-identically in-feed, since Reddit unfurls a direct
 * image URL into the same inline preview. Worth revisiting if subreddits our
 * users care about turn out to disallow link posts.
 */
export async function publishToReddit(params: {
  accessToken: string;
  subreddit: string;
  title: string;
  mediaUrl: string;
}): Promise<string> {
  const body = new URLSearchParams({
    sr: params.subreddit.replace(/^\/?r\//, ""),
    kind: "link",
    title: params.title.slice(0, MAX_TITLE),
    url: params.mediaUrl,
    api_type: "json",
    // Reddit's own duplicate guard — without it a retried publish 409s with
    // "that link has already been submitted", which reads as a hard failure.
    resubmit: "true",
    sendreplies: "true",
  });

  const res = await fetch(`${REDDIT_OAUTH}/api/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });

  const data = (await res.json()) as {
    json?: {
      errors?: string[][];
      data?: { id?: string; name?: string; url?: string };
    };
  };

  // Reddit answers 200 with the failure inside json.errors — a bare res.ok
  // check reports success on rejected posts (wrong flair, subreddit rules,
  // rate limit), so the error array is the real status.
  const errors = data.json?.errors ?? [];
  if (errors.length > 0) {
    // Each entry is [CODE, human message, field]; the message is the useful bit.
    throw new Error(errors.map((e) => e[1] ?? e[0]).join("; "));
  }
  if (!res.ok) throw new Error(`Reddit submit failed (${res.status})`);

  const id = data.json?.data?.name ?? data.json?.data?.id;
  if (!id) throw new Error("Reddit accepted the post but returned no id");
  return id;
}
