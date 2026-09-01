import { createHmac, timingSafeEqual } from "crypto";

// The Meta connect flow round-trips a `state` param through Facebook that the
// callback trusts as the workspaceId to attach pages to. Unsigned, anyone could
// forge a callback and connect their Facebook page to someone else's workspace
// (CSRF). So we sign `${workspaceId}.${issuedAt}` with HMAC-SHA256 and verify it
// on the way back. Keyed on META_APP_SECRET — already required by this flow, so
// no extra env wiring.
const STATE_TTL_MS = 10 * 60 * 1000; // an OAuth round-trip is seconds; 10 min is generous

/** What a verified state tells us about the round trip that started it. */
export interface OAuthStateClaims {
  workspaceId: string;
  /**
   * Who started the connect.
   *
   * Null for a state signed before actors were carried — an in-flight round
   * trip across a deploy — and for anything else that can't produce one. The
   * audit log records that null honestly rather than inventing an actor,
   * because a security log that guesses is worse than one with a gap.
   */
  userId: string | null;
}

function sign(payload: string): string {
  const secret = process.env.META_APP_SECRET;
  if (!secret) throw new Error("META_APP_SECRET is not set");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Sign the state that round-trips through the provider.
 *
 * Carries the ACTOR as well as the workspace. The callbacks have no session —
 * a provider redirect arrives with whatever cookies it arrives with, and the
 * signed state is the only thing we can trust — so before this, every
 * `connected` row in social_connection_events had a null actor while
 * disconnects recorded one. Half a security log.
 *
 * The user id is inside the signature, not alongside it: an unsigned actor
 * would be worse than none, since it could be forged to attribute a connection
 * to somebody else.
 */
export function signOAuthState(workspaceId: string, userId?: string): string {
  const payload = `${workspaceId}.${userId ?? ""}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a signed state and return the workspaceId it carries, or null if the
 * signature is invalid, malformed, or expired. Never throws on bad input.
 */
export function verifyOAuthState(
  state: string | null,
): OAuthStateClaims | null {
  if (!state) return null;
  const parts = state.split(".");

  // Two shapes are accepted on purpose. The 3-part form predates actors, and
  // someone can be mid-OAuth when a deploy lands — refusing it would fail
  // their connect for no security gain, since the signature still covers
  // everything that form carries.
  let workspaceId: string;
  let userId: string | null;
  let issuedAt: string;
  let sig: string;
  let payload: string;
  if (parts.length === 4) {
    [workspaceId, , issuedAt, sig] = parts;
    userId = parts[1] || null;
    payload = `${workspaceId}.${parts[1]}.${issuedAt}`;
  } else if (parts.length === 3) {
    [workspaceId, issuedAt, sig] = parts;
    userId = null;
    payload = `${workspaceId}.${issuedAt}`;
  } else {
    return null;
  }

  const expected = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  const issued = Number(issuedAt);
  if (!Number.isFinite(issued) || Date.now() - issued > STATE_TTL_MS)
    return null;

  return { workspaceId, userId };
}
