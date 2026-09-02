/**
 * Which platforms this DEPLOYMENT can actually start a connection for.
 *
 * "Configured" here means one narrow thing: the credentials a connect route
 * needs to redirect somewhere real are present. It is not a claim that the
 * connection will succeed, that the platform's review has cleared, or that a
 * post will publish — those are separate gates and each fails on its own.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The settings page showed a "3/3 ready" pill next to TikTok while
 * /api/social/connect/tiktok was answering 503 "isn't configured on this
 * deployment yet". That pill counted a checklist the USER had ticked in their
 * own browser — self-attested boxes in localStorage, verifying nothing — so a
 * platform with no credentials at all read as more ready than one with them.
 *
 * The client cannot read env, which is why it was guessing. This is the same
 * fix already applied to `ayrshareEnabled`: decide it on the server, where the
 * truth is, and send the answer.
 *
 * ── Why the connect routes import this too ─────────────────────────────────
 *
 * A second list of env conditions is a list that drifts from the first. That
 * is not hypothetical here: the connection role gate and the audit log were
 * both written per-route and both grew holes exactly where someone added a
 * route and didn't revisit every other file. The 503 and the badge now read
 * the SAME function, so a platform cannot advertise itself as ready and then
 * refuse the click.
 */

/** Every platform the settings UI can offer a connection for. */
export const CONNECTABLE_PLATFORMS = [
  "facebook",
  "instagram",
  "bluesky",
  "linkedin",
  "reddit",
  "pinterest",
  "tiktok",
  "youtube",
] as const;

export type ConnectablePlatform = (typeof CONNECTABLE_PLATFORMS)[number];

export function isPlatformConfigured(platform: string): boolean {
  switch (platform) {
    /**
     * Bluesky needs NO developer app, no env var and no review — the user
     * pastes a handle and an app password. It is therefore always configured,
     * and is the only platform for which that is true.
     */
    case "bluesky":
      return true;

    // Both ride the same Meta app; Instagram is reached through the Page.
    case "facebook":
    case "instagram":
      return Boolean(process.env.META_APP_ID);

    case "linkedin":
      return Boolean(process.env.LINKEDIN_CLIENT_ID);
    case "reddit":
      return Boolean(process.env.REDDIT_CLIENT_ID);
    case "pinterest":
      return Boolean(process.env.PINTEREST_APP_ID);
    case "tiktok":
      return Boolean(process.env.TIKTOK_CLIENT_KEY);
    case "youtube":
      return Boolean(process.env.YOUTUBE_CLIENT_ID);

    /**
     * Anything else — X, Threads, GMB, Telegram — has no direct adapter and
     * reaches its network through the paid broker, not through a connect route
     * of ours. Unknown is NOT configured: claiming a platform is ready because
     * we failed to recognise its name is the failure this file exists to stop.
     */
    default:
      return false;
  }
}

/** The configured subset, for sending to a client that cannot read env. */
export function configuredPlatforms(): string[] {
  return CONNECTABLE_PLATFORMS.filter(isPlatformConfigured);
}
