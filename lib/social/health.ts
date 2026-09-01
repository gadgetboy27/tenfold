const META_API = "https://graph.facebook.com/v21.0";

/**
 * Connection health for a stored social grant.
 *
 * This exists because of a failure that took two sessions to diagnose: the
 * Settings screen showed a healthy green "Connected · LetsRoam" for seven
 * weeks while every publish to it failed. The token was dead AND its grant
 * covered a different Page than the one we had stored, and nothing looked at
 * either fact until someone tried to post.
 *
 * A connection is not "healthy" because a row exists. It is healthy when the
 * provider still agrees, so we ask the provider.
 */
export type ConnectionStatus =
  | "ok"
  | "token_invalid"
  | "page_not_granted"
  | "unchecked";

export interface ConnectionHealth {
  status: ConnectionStatus;
  /** User-facing, already phrased as what to do about it. Null when ok. */
  message: string | null;
  /** Page ids the grant actually covers, when the provider reports them. */
  grantedPageIds?: string[];
  /**
   * WHICH check produced this verdict.
   *
   * A green tick that only means "a row exists" is what caused the seven-week
   * outage. A green tick that means "we asked Meta and it said yes" is worth
   * something — but only if the user can tell the two apart, and only if we
   * are honest that the fallback proves less than the primary check.
   *
   *  - `debug_token` — authoritative. Token validity AND the per-Page grant.
   *  - `page_read`   — fallback. We reached the Page with the stored token, so
   *                    it works; this does NOT prove the publish scopes cover
   *                    it, which is the exact fault debug_token exists to find.
   */
  checkedVia?: "debug_token" | "page_read" | null;
  /** When the check ran, so a stale confirmation can't masquerade as fresh. */
  checkedAt?: string;
  /** Positive confirmation for a healthy connection, naming what we reached. */
  confirmation?: string;
}

/**
 * Meta grants permissions PER PAGE ("granular scopes"), so holding a valid
 * token proves nothing about the Page we publish to — the grant can cover a
 * Page we've never stored. That mismatch is invisible until a post is
 * attempted, which is exactly when it costs the most.
 */
export interface GranularScope {
  scope: string;
  target_ids?: string[];
}

/**
 * The scopes a publish actually depends on. `pages_show_list` is deliberately
 * NOT here: it governs discovery, not posting, and treating it as required
 * would report a healthy connection as broken.
 */
const PUBLISH_SCOPES = ["pages_manage_posts", "pages_read_engagement"];

/**
 * Whether the grant covers this Page for publishing.
 *
 * A scope with no `target_ids` is unrestricted — Meta omits the list rather
 * than enumerating every Page — so absence means "all", never "none". Getting
 * that backwards would flag every healthy connection as broken.
 */
export function pageIsGranted(
  granular: GranularScope[] | undefined,
  pageId: string,
): boolean {
  if (!granular?.length) return true;
  const relevant = granular.filter((g) => PUBLISH_SCOPES.includes(g.scope));
  if (relevant.length === 0) return true;
  return relevant.every(
    (g) => !g.target_ids?.length || g.target_ids.includes(pageId),
  );
}

/**
 * Must this connection be kept off every "you're good to go" surface?
 *
 * Four places decide how a connection looks — the summary block, the collapsed
 * card header, the expanded card, and the setup wizard — and they were only
 * ever asking "does a row exist?". That is how a dead grant kept a green tick
 * and a "You're ready to publish" line above the very card that said "Needs
 * reconnecting". One predicate so they cannot drift apart again.
 *
 * "unchecked" is deliberately NOT a fault, and neither is a missing verdict: a
 * connection we could not ask about (no app secret, Graph unreachable, health
 * still in flight) must render exactly as it did before this check existed.
 * Painting those red is the failure mode that teaches people to ignore the
 * warning, which costs more than the warning is worth.
 */
export function isUnhealthy(health: ConnectionHealth | undefined): boolean {
  if (!health) return false;
  return health.status !== "ok" && health.status !== "unchecked";
}

/** Every Page id named by the publish-critical scopes, de-duplicated. */
export function grantedPageIds(
  granular: GranularScope[] | undefined,
): string[] {
  const ids = new Set<string>();
  for (const g of granular ?? []) {
    if (!PUBLISH_SCOPES.includes(g.scope)) continue;
    for (const id of g.target_ids ?? []) ids.add(id);
  }
  return [...ids];
}

interface DebugTokenResponse {
  data?: {
    is_valid?: boolean;
    scopes?: string[];
    granular_scopes?: GranularScope[];
  };
  error?: { message: string };
}

/**
 * Ask Meta what a stored token can actually do.
 *
 * Network trouble returns "unchecked", never a failure verdict — telling
 * someone their working connection is broken because Graph was briefly
 * unreachable is its own bug, and one that would train them to ignore this.
 */
export async function checkMetaConnection(
  accessToken: string,
  pageId: string | null,
): Promise<ConnectionHealth> {
  const checkedAt = new Date().toISOString();

  // No app secret means debug_token is impossible — but the stored token is
  // still testable on its own, so fall through rather than giving up. This is
  // the case a self-hosted or partially-configured deployment lands in, and
  // "we can't tell you anything" is a poor answer when we can still try the
  // door handle.
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return pageReadFallback(accessToken, pageId, checkedAt);
  }

  let body: DebugTokenResponse;
  try {
    const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
    const res = await fetch(
      `${META_API}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    body = (await res.json()) as DebugTokenResponse;
  } catch {
    return pageReadFallback(accessToken, pageId, checkedAt);
  }

  if (body.error || !body.data) {
    return pageReadFallback(accessToken, pageId, checkedAt);
  }

  const granted = grantedPageIds(body.data.granular_scopes);

  if (body.data.is_valid === false) {
    return {
      status: "token_invalid",
      message:
        "Facebook has invalidated this connection. Reconnect it to publish again.",
      grantedPageIds: granted,
      checkedVia: "debug_token",
      checkedAt,
    };
  }

  if (pageId && !pageIsGranted(body.data.granular_scopes, pageId)) {
    return {
      status: "page_not_granted",
      message:
        "Facebook hasn't granted access to the Page you're publishing to. Reconnect and tick that Page in the permissions step.",
      grantedPageIds: granted,
      checkedVia: "debug_token",
      checkedAt,
    };
  }

  return {
    status: "ok",
    message: null,
    grantedPageIds: granted,
    checkedVia: "debug_token",
    checkedAt,
    confirmation: "Facebook confirmed this token and the Page it publishes to.",
  };
}

/**
 * The fallback confirmation: try the door handle.
 *
 * debug_token is the authoritative check but it needs the app secret and a
 * reachable Graph. When either is missing the old code returned "unchecked",
 * which the UI renders exactly like healthy — so a deployment with no app
 * secret showed a confident green tick backed by nothing at all.
 *
 * One cheap authenticated read of the Page the connection publishes to is a
 * weaker signal, and it is a real one: if Graph answers with the Page, the
 * stored token works right now. It CANNOT see the per-Page scope grant, which
 * is the exact fault that caused the original outage — so a pass here is
 * reported as `page_read`, never dressed up as the full check.
 *
 * The three outcomes are kept apart deliberately:
 *  - Graph returns the Page  → ok, with what we reached.
 *  - Graph returns an error  → the token really is refused. Say so.
 *  - The request throws      → unchecked. A network blip is not a verdict.
 */
async function pageReadFallback(
  accessToken: string,
  pageId: string | null,
  checkedAt: string,
): Promise<ConnectionHealth> {
  if (!pageId) return { status: "unchecked", message: null, checkedAt };
  try {
    const res = await fetch(
      `${META_API}/${pageId}?fields=name&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const body = (await res.json()) as { name?: string; error?: unknown };
    if (res.ok && !body.error) {
      return {
        status: "ok",
        message: null,
        checkedVia: "page_read",
        checkedAt,
        confirmation: body.name
          ? `Reached ${body.name} with the stored credential.`
          : "Reached this account with the stored credential.",
      };
    }
    return {
      status: "token_invalid",
      message:
        "Facebook refused this connection. Reconnect it to publish again.",
      checkedVia: "page_read",
      checkedAt,
    };
  } catch {
    return { status: "unchecked", message: null, checkedAt };
  }
}

/**
 * Prove a freshly minted Page token before we call the connection a success.
 * One cheap read exercises the whole chain — token, Page, impersonation — and
 * turns a failure that would have surfaced at publish time into one the user
 * sees while they are still in the connect flow and able to fix it.
 */
export async function verifyPageToken(
  pageId: string,
  pageToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${META_API}/${pageId}?fields=name&access_token=${encodeURIComponent(pageToken)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const body = (await res.json()) as { error?: unknown };
    return res.ok && !body.error;
  } catch {
    // Unreachable Graph is not proof of a bad grant — don't fail the connect.
    return true;
  }
}
