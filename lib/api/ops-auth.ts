import { timingSafeEqual } from "crypto";

/**
 * Auth for the endpoints no user ever calls — the crons, the internal pipeline
 * trigger, and `/api/health?verbose=1`.
 *
 * ── Why this is one file ───────────────────────────────────────────────────
 *
 * The check was written per-route four times, and all four carried the same
 * flaw: `process.env.CRON_SECRET || "dev-secret"`. A fallback constant that
 * lives in the repository is not a secret, so any deployment that hadn't set
 * CRON_SECRET accepted a token an attacker could read here — and the endpoints
 * behind it are not read-only. `GET /api/cron/sweep-jobs` marks jobs terminal
 * and moves credits.
 *
 * Production has always had the var set, so this was a trapdoor rather than an
 * open door. But "safe as long as nobody unsets an optional env var" is not a
 * property worth relying on, and it is `.optional()` in lib/validation/env.ts
 * precisely so a deployment can boot without it.
 *
 * Same reasoning as lib/social/configured.ts: a second copy of an env condition
 * is a copy that drifts. One function, four call sites.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * **Fail closed.** No CRON_SECRET means nothing authenticates, so the ops
 * endpoints answer 401 to everyone rather than accepting a known constant. The
 * failure mode is "the cron stops running", which is visible and recoverable;
 * the old one was "anyone can run the cron", which is neither.
 */

/** Constant-time compare that doesn't leak length through an exception. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which is itself a signal —
  // compare lengths first so both paths cost the same.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * `Authorization: Bearer <CRON_SECRET>` — the convention the cron routes use
 * and what Railway's scheduler sends. False when CRON_SECRET is unset.
 */
export function isOpsRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return secretMatches(
    req.headers.get("Authorization") ?? "",
    `Bearer ${secret}`,
  );
}

/**
 * `x-internal-secret: <CRON_SECRET>` — the service-to-service variant, used by
 * the content pipeline where one of our own routes calls another. Same secret,
 * different header, same fail-closed rule.
 */
export function isInternalRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return secretMatches(req.headers.get("x-internal-secret") ?? "", secret);
}

/**
 * The header an internal caller must send, or null when CRON_SECRET is unset.
 *
 * Null is the caller's signal to not bother: `isInternalRequest` will reject
 * unconditionally in that state, so firing the request anyway just produces a
 * 401 and a confusing log line instead of an honest "this isn't configured".
 */
export function internalSecretHeader(): Record<string, string> | null {
  const secret = process.env.CRON_SECRET;
  return secret ? { "x-internal-secret": secret } : null;
}
