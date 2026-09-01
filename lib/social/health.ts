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
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return { status: "unchecked", message: null };
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
    return { status: "unchecked", message: null };
  }

  if (body.error || !body.data) {
    return { status: "unchecked", message: null };
  }

  const granted = grantedPageIds(body.data.granular_scopes);

  if (body.data.is_valid === false) {
    return {
      status: "token_invalid",
      message:
        "Facebook has invalidated this connection. Reconnect it to publish again.",
      grantedPageIds: granted,
    };
  }

  if (pageId && !pageIsGranted(body.data.granular_scopes, pageId)) {
    return {
      status: "page_not_granted",
      message:
        "Facebook hasn't granted access to the Page you're publishing to. Reconnect and tick that Page in the permissions step.",
      grantedPageIds: granted,
    };
  }

  return { status: "ok", message: null, grantedPageIds: granted };
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
