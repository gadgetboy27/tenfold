import { createHmac, timingSafeEqual } from "crypto";

// The Meta connect flow round-trips a `state` param through Facebook that the
// callback trusts as the workspaceId to attach pages to. Unsigned, anyone could
// forge a callback and connect their Facebook page to someone else's workspace
// (CSRF). So we sign `${workspaceId}.${issuedAt}` with HMAC-SHA256 and verify it
// on the way back. Keyed on META_APP_SECRET — already required by this flow, so
// no extra env wiring.
const STATE_TTL_MS = 10 * 60 * 1000; // an OAuth round-trip is seconds; 10 min is generous

/**
 * Signing key for the state parameter.
 *
 * This is our own CSRF token — it never leaves our round-trip and no provider
 * verifies it — so the key just has to be a server-side secret, not Meta's in
 * particular. It was keyed on META_APP_SECRET when Facebook was the only
 * connect flow; Reddit and LinkedIn have no reason to require Meta's app to be
 * configured, so prefer a dedicated secret and keep META_APP_SECRET as the
 * fallback rather than invalidating every in-flight Facebook connect on deploy.
 */
function sign(payload: string): string {
  const secret = process.env.OAUTH_STATE_SECRET ?? process.env.META_APP_SECRET;
  if (!secret) {
    throw new Error("Set OAUTH_STATE_SECRET to enable social connections");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signOAuthState(workspaceId: string): string {
  const payload = `${workspaceId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a signed state and return the workspaceId it carries, or null if the
 * signature is invalid, malformed, or expired. Never throws on bad input.
 */
export function verifyOAuthState(state: string | null): string | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [workspaceId, issuedAt, sig] = parts;

  const expected = sign(`${workspaceId}.${issuedAt}`);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  const issued = Number(issuedAt);
  if (!Number.isFinite(issued) || Date.now() - issued > STATE_TTL_MS)
    return null;

  return workspaceId;
}
