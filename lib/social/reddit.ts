import {
  callbackUrl,
  registerProvider,
  type OAuthTokens,
} from "@/lib/social/providers";

/**
 * Reddit — the first direct integration after Meta, and deliberately so: its
 * OAuth is self-serve, so it needs no app audit. TikTok gates public posting
 * behind a review and LinkedIn vets the Community Management API, which means
 * Reddit is the only network that can prove this whole layer end-to-end while
 * those two sit in a queue.
 *
 * Reddit's access token lasts one hour, which also makes it the sharpest test
 * of the refresh path: get that wrong and a connection dies the same day.
 */

const OAUTH = "https://www.reddit.com/api/v1";
const API = "https://oauth.reddit.com";

/** Reddit requires a descriptive, unique UA and rate-limits generic ones hard. */
export const REDDIT_UA = "web:nz.tenfold.app:v1.0 (by /u/tenfold-app)";

function basicAuth(): string {
  const id = process.env.REDDIT_CLIENT_ID ?? "";
  const secret = process.env.REDDIT_CLIENT_SECRET ?? "";
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const res = await fetch(`${OAUTH}/access_token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_UA,
    },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`Reddit token request failed: ${data.error ?? res.status}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresInSec: data.expires_in ?? 3600,
  };
}

registerProvider({
  id: "reddit",
  label: "Reddit",
  // identity → who we connected; submit → post on their behalf.
  scopes: ["identity", "submit"],

  authUrl(state) {
    const params = new URLSearchParams({
      client_id: process.env.REDDIT_CLIENT_ID ?? "",
      response_type: "code",
      state,
      redirect_uri: callbackUrl("reddit"),
      // permanent is what makes Reddit return a refresh_token at all; without
      // it the connection would die in an hour with no way back.
      duration: "permanent",
      scope: "identity submit",
    });
    return `${OAUTH.replace("/api/v1", "")}/api/v1/authorize?${params}`;
  },

  exchangeCode(code) {
    return tokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl("reddit"),
      }),
    );
  },

  refresh(refreshToken) {
    return tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    );
  },

  // Reddit's permanent refresh token is reusable — it does not rotate.
  rotatesRefreshToken: false,
});

/** The connected account's username, for display in Settings → Social. */
export async function getRedditIdentity(
  accessToken: string,
): Promise<{ name: string } | null> {
  const res = await fetch(`${API}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": REDDIT_UA,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { name?: string };
  return data.name ? { name: data.name } : null;
}
