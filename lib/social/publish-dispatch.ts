/**
 * Where a single platform's post goes, and how it went.
 *
 * The publish route used to be a hardcoded fork — `if facebook / else if
 * instagram / else ayrshare` — which meant every new direct integration was
 * another branch, and nothing recorded which backend actually handled a
 * platform or why one failed. This is the seam that replaces it: one function
 * decides the backend, and one shape reports the outcome, so a future direct
 * adapter (Reddit, LinkedIn, TikTok) plugs in without touching the loop and
 * every attempt is logged the same way.
 *
 * No behaviour change today: Meta still handles Facebook/Instagram directly and
 * Ayrshare handles the rest. What changes is that the decision and the result
 * are now data, not control flow.
 */

/** Which system published (or tried to). */
export type PublishBackend = "meta" | "ayrshare";

export interface PublishOutcome {
  platform: string;
  backend: PublishBackend;
  ok: boolean;
  /** The provider's post id on success. */
  postId?: string;
  /** The platform's own words on failure — never a generic message. */
  reason?: string;
}

/**
 * Pick the backend for a platform.
 *
 * "Direct first, Ayrshare fallback" is the stated architecture, and today
 * "direct" means Meta and only for accounts actually connected here — a
 * workspace that linked Facebook through Ayrshare instead still routes there.
 * When a real direct adapter exists for another platform, it slots in ahead of
 * the Ayrshare line and nothing else moves.
 */
export function backendFor(
  platform: string,
  hasMetaProfile: boolean,
): PublishBackend {
  if ((platform === "facebook" || platform === "instagram") && hasMetaProfile) {
    return "meta";
  }
  return "ayrshare";
}
