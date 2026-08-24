const OUTSTAND_API = "https://api.outstand.so/v1";

/**
 * The "broker" backend: a paid intermediary that holds its OWN approved
 * platform apps, so a network can be published to before we have cleared that
 * platform's review ourselves.
 *
 * This exists because of what Ayrshare taught us. Ayrshare was $599/mo flat,
 * which could not be attributed to the customer who caused it, and when their
 * account was suspended every network behind it died at once with no warning
 * (ISSUES.md — the 403 code 276 incident).
 *
 * Two things make this different in kind, not just in price:
 *
 * 1. **Usage-based.** ~$0.007 per post attributes exactly, the same way a fal
 *    job does, so it can be charged to the workspace that spent it instead of
 *    coming out of margin as a fixed monthly bill.
 *
 * 2. **Removable by design.** Outstand supports white-label BYO credentials —
 *    once our own TikTok audit and Google verification land, each network flips
 *    to lib/social/direct/* and stops coming through here. The broker is a
 *    BRIDGE, not a foundation. Anything added here should be something we
 *    intend to stop using.
 *
 * NOT verified against the live API — no account exists yet. Shapes follow
 * Outstand's published contract; the first real publish proves them.
 */

/**
 * Networks worth brokering. Deliberately does NOT include anything in
 * DIRECT_PLATFORMS or the Meta backend: paying a per-post fee for something we
 * already publish for free would be silently spending the customer's credits
 * on nothing.
 *
 * TikTok and YouTube ARE here despite having direct adapters, because those
 * adapters are blocked on platform review — see canBroker().
 */
export const BROKER_PLATFORMS = [
  "x",
  "twitter",
  "threads",
  "gmb",
  "telegram",
  "tiktok",
  "youtube",
] as const;

export type BrokerPlatform = (typeof BROKER_PLATFORMS)[number];

export function isBrokerPlatform(p: string): p is BrokerPlatform {
  return (BROKER_PLATFORMS as readonly string[]).includes(p);
}

/** Configured at all? Absent credentials mean the broker simply isn't offered. */
export function isBrokerEnabled(): boolean {
  return !!process.env.OUTSTAND_API_KEY;
}

/**
 * TikTok and YouTube have working direct adapters, so they should only be
 * brokered while OUR app is still waiting on approval. Flipping these to false
 * (or connecting the account directly) is what retires the per-post cost.
 */
export function shouldBroker(platform: string, hasDirectConnection: boolean) {
  if (!isBrokerPlatform(platform)) return false;
  if (!isBrokerEnabled()) return false;
  // A direct connection always wins: it's free and it's ours.
  return !hasDirectConnection;
}

export interface BrokerPublishResult {
  id: string;
}

/**
 * Publish one asset to one brokered network.
 *
 * Throws with a user-presentable message, matching publishDirect's contract, so
 * the publish route reports per-platform failures identically whichever backend
 * produced them.
 */
export async function publishViaBroker(params: {
  /** Outstand's identifier for this workspace's connected account. */
  accountId: string;
  platform: BrokerPlatform;
  mediaUrl: string;
  caption: string;
  scheduledAt?: string;
}): Promise<BrokerPublishResult> {
  const res = await fetch(`${OUTSTAND_API}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OUTSTAND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountId: params.accountId,
      platform: params.platform,
      content: params.caption,
      mediaUrls: [params.mediaUrl],
      ...(params.scheduledAt ? { scheduledAt: params.scheduledAt } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok || !data.id) {
    throw new Error(
      data.error ?? data.message ?? `Publishing failed (${res.status})`,
    );
  }
  return { id: data.id };
}

/**
 * Start a hosted connect flow. Outstand runs the OAuth against its own approved
 * apps, which is the entire point — the user authorises without us holding a
 * developer app for that network.
 */
export async function getBrokerConnectUrl(params: {
  workspaceId: string;
  platform: BrokerPlatform;
  redirectUrl: string;
}): Promise<string> {
  const res = await fetch(`${OUTSTAND_API}/accounts/connect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OUTSTAND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Our workspace id is the external reference, so a callback can be tied
      // back to the tenant without trusting anything the browser sends.
      externalId: params.workspaceId,
      platform: params.platform,
      redirectUrl: params.redirectUrl,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Could not start the connection");
  }
  return data.url;
}
