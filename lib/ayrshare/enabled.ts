/**
 * The single gate on every Ayrshare call.
 *
 * Ayrshare was made opt-in (CLAUDE.md §7d) and gated in the publish and
 * profiles routes — but only there. Six other call sites reached it directly:
 * /api/social/connect, /api/social/disconnect, the analytics refresh and its
 * cron, both content-agent stages, and the health check. When the Ayrshare
 * account was suspended, every one of those started returning
 *
 *   403 {"code":276,"action":"authorization",
 *        "message":"This account has been suspended..."}
 *
 * and the most visible was /api/social/connect — the "connect an account"
 * button itself, which is the worst possible place for a dead third party.
 *
 * Gating each caller is how this happened in the first place: a flag checked in
 * n places is a flag missed in n-1. This is checked at the boundary instead, so
 * a call cannot reach Ayrshare without passing it, whatever new route someone
 * adds later.
 */
export function isAyrshareEnabled(): boolean {
  return process.env.AYRSHARE_ENABLED === "true";
}

/** Thrown when something tries to reach Ayrshare while it is switched off. */
export class AyrshareDisabledError extends Error {
  /** Callers map this to a clear "not available" state, never a 500. */
  readonly disabled = true;

  constructor(operation: string) {
    super(
      `Ayrshare is switched off, so ${operation} is unavailable. ` +
        `X, LinkedIn, TikTok, YouTube, Threads, Snapchat, Google Business and ` +
        `Telegram publish through Ayrshare; Facebook, Instagram, Bluesky, ` +
        `Reddit and Pinterest connect directly and are unaffected.`,
    );
    this.name = "AyrshareDisabledError";
  }
}

/** Refuse before the network call. Every ayrshare/* function starts here. */
export function assertAyrshareEnabled(operation: string): void {
  if (!isAyrshareEnabled()) throw new AyrshareDisabledError(operation);
}
