const PINTEREST_API = "https://api.pinterest.com/v5";
const PINTEREST_WWW = "https://www.pinterest.com";

// Pin titles cap at 100 chars and descriptions at 800 (v5 rejects over-long
// values outright rather than trimming).
const MAX_PIN_TITLE = 100;
const MAX_PIN_DESCRIPTION = 800;

export function getPinterestOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.PINTEREST_APP_ID!,
    redirect_uri: `${process.env.APP_URL}/api/social/callback/pinterest`,
    response_type: "code",
    scope: "boards:read,pins:read,pins:write,user_accounts:read",
    state,
  });
  return `${PINTEREST_WWW}/oauth/?${params}`;
}

function basicAuthHeader(): string {
  const creds = `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

export interface PinterestTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

async function tokenRequest(body: URLSearchParams): Promise<PinterestTokens> {
  const res = await fetch(`${PINTEREST_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.message ?? "Pinterest token exchange failed");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    // Pinterest access tokens last 30 days; refresh tokens last a year.
    expiresAt: new Date(Date.now() + (data.expires_in ?? 2_592_000) * 1000),
  };
}

export async function exchangePinterestCode(
  code: string,
): Promise<PinterestTokens> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.APP_URL}/api/social/callback/pinterest`,
    }),
  );
}

export async function refreshPinterestToken(
  refreshToken: string,
): Promise<PinterestTokens> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

export interface PinterestBoard {
  id: string;
  name: string;
}

/**
 * The user's boards, for the board picker. A pin MUST name a board — there is
 * no "default" — so a Pinterest connection without at least one board can't
 * publish, and the connect flow surfaces that immediately rather than at the
 * first failed publish.
 */
export async function getPinterestBoards(
  accessToken: string,
): Promise<PinterestBoard[]> {
  const res = await fetch(`${PINTEREST_API}/boards?page_size=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as {
    items?: Array<{ id: string; name: string }>;
    message?: string;
  };
  if (!res.ok)
    throw new Error(data.message ?? "Could not load Pinterest boards");
  return (data.items ?? []).map((b) => ({ id: b.id, name: b.name }));
}

export async function getPinterestAccount(
  accessToken: string,
): Promise<{ username: string }> {
  const res = await fetch(`${PINTEREST_API}/user_account`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as { username?: string; message?: string };
  if (!res.ok || !data.username) {
    throw new Error(data.message ?? "Could not read Pinterest account");
  }
  return { username: data.username };
}

/**
 * Create an image pin from a public URL — Pinterest fetches the media itself,
 * which is why this needs no upload step (and why the asset must live in the
 * public Storage bucket, per CLAUDE.md §8's rule against signed URLs).
 *
 * Video pins are NOT supported here: they require the /v5/media register →
 * presigned-S3 → poll-for-processing flow, which is a separate piece of work.
 * The publish route routes video away from Pinterest before reaching this.
 */
export async function publishToPinterest(params: {
  accessToken: string;
  boardId: string;
  title: string;
  description: string;
  mediaUrl: string;
  link?: string;
}): Promise<string> {
  const res = await fetch(`${PINTEREST_API}/pins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      board_id: params.boardId,
      title: params.title.slice(0, MAX_PIN_TITLE),
      description: params.description.slice(0, MAX_PIN_DESCRIPTION),
      ...(params.link ? { link: params.link } : {}),
      media_source: { source_type: "image_url", url: params.mediaUrl },
    }),
  });
  const data = (await res.json()) as { id?: string; message?: string };
  if (!res.ok || !data.id) {
    throw new Error(data.message ?? "Pinterest pin creation failed");
  }
  return data.id;
}
