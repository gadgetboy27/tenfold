/**
 * Cut off a provider's access, not just our copy of it.
 *
 * `POST /api/social/disconnect` used to delete the `social_profiles` row and
 * unlink Ayrshare, and stop. The grant stayed live at the provider — so
 * someone who clicked Disconnect because a token might have leaked had, in
 * fact, only destroyed the evidence. The one action a user takes when they're
 * worried about a credential was the action that did the least about it.
 *
 * Revoking is not uniformly possible, and pretending otherwise would be the
 * same lie in a new place. Three honest outcomes:
 *
 *  - `revoked`  — the provider confirmed it. Access is gone.
 *  - `manual`   — the provider offers no server-side revocation for what we
 *                 hold. The user must do it, so we hand them the exact page.
 *  - `failed`   — we tried and it didn't work. Say so, give them the page.
 *
 * Never `revoked` on a guess: a false "access removed" is worse than an honest
 * "here's where to remove it", because it ends the user's investigation.
 */

export type RevokeStatus = "revoked" | "manual" | "failed";

export interface RevokeOutcome {
  status: RevokeStatus;
  /** Shown to the user. Always says what is still true, never just "done". */
  message: string;
  /** Where the user finishes the job themselves, when we can't. */
  manualUrl?: string;
}

export interface RevokeInput {
  platform: string;
  accessToken: string | null;
  refreshToken?: string | null;
}

/**
 * Where each provider lets someone remove an app by hand.
 *
 * Every platform gets an entry, including the ones we can revoke
 * automatically: a `failed` revocation still needs somewhere to send them, and
 * "contact support" is not an answer when the user is trying to cut off access
 * to their own account right now.
 */
const MANUAL_REVOKE_URL: Record<string, string> = {
  facebook: "https://www.facebook.com/settings?tab=business_tools",
  instagram: "https://www.facebook.com/settings?tab=business_tools",
  linkedin: "https://www.linkedin.com/psettings/permitted-services",
  pinterest: "https://www.pinterest.com/settings/security",
  bluesky: "https://bsky.app/settings/app-passwords",
  reddit: "https://www.reddit.com/prefs/apps",
  tiktok: "https://www.tiktok.com/setting",
  youtube: "https://myaccount.google.com/permissions",
};

export function manualRevokeUrl(platform: string): string | undefined {
  return MANUAL_REVOKE_URL[platform];
}

const TIMEOUT_MS = 8000;

/** Google (YouTube). Revokes the whole grant, refresh token included. */
async function revokeGoogle(token: string): Promise<boolean> {
  const res = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  // 200 = revoked. 400 = already invalid, which is the state we wanted anyway.
  return res.ok || res.status === 400;
}

/** Reddit. Needs app basic auth, and answers 204 with an empty body. */
async function revokeReddit(token: string): Promise<boolean> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return false;
  const res = await fetch("https://www.reddit.com/api/v1/revoke_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token, token_type_hint: "access_token" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok;
}

/**
 * Revoke at the provider, as far as each one allows.
 *
 * **Meta is deliberately `manual`.** Revoking a Facebook grant is
 * `DELETE /{user-id}/permissions`, which needs the long-lived USER token — and
 * the connect callback uses that token to list Pages and then throws it away,
 * storing only per-Page tokens. Keeping the user token so we could revoke it
 * would mean holding a second long-lived credential, in plaintext, to make a
 * rare action tidier. That trade is backwards: it enlarges the blast radius of
 * a database leak every day to improve one click. So we tell the truth and
 * point at Business Integrations instead.
 */
export async function revokeAtProvider(
  input: RevokeInput,
): Promise<RevokeOutcome> {
  const { platform, accessToken, refreshToken } = input;
  const manualUrl = manualRevokeUrl(platform);

  if (!accessToken) {
    return {
      status: "manual",
      message: "No stored credential to revoke — nothing was sent.",
      ...(manualUrl ? { manualUrl } : {}),
    };
  }

  try {
    if (platform === "youtube") {
      // Revoke the refresh token where we have one: at Google it takes the
      // whole grant with it, whereas the access token alone expires anyway.
      const ok = await revokeGoogle(refreshToken || accessToken);
      return ok
        ? { status: "revoked", message: "Google access revoked." }
        : {
            status: "failed",
            message: "Google wouldn't confirm the revocation.",
            ...(manualUrl ? { manualUrl } : {}),
          };
    }

    if (platform === "reddit") {
      const ok = await revokeReddit(accessToken);
      return ok
        ? { status: "revoked", message: "Reddit access revoked." }
        : {
            status: "failed",
            message: "Reddit wouldn't confirm the revocation.",
            ...(manualUrl ? { manualUrl } : {}),
          };
    }

    // Everything else: no server-side revocation for the credential we hold.
    return {
      status: "manual",
      message: manualUrl
        ? "Removed here — but the app is still authorised on your account until you remove it there too."
        : "Removed here. Check your account settings on that platform to remove the app.",
      ...(manualUrl ? { manualUrl } : {}),
    };
  } catch {
    // A network failure is not a revocation. Say so.
    return {
      status: "failed",
      message: "Couldn't reach the provider to revoke access.",
      ...(manualUrl ? { manualUrl } : {}),
    };
  }
}
