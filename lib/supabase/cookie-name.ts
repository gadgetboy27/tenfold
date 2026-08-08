/**
 * Identifying Supabase auth cookies that no longer belong to this project URL.
 *
 * ## The 431
 *
 * `@supabase/ssr` derives the auth cookie name from the Supabase URL's first
 * hostname label (verified empirically against 0.10.3):
 *
 *     https://gbccfqpmoteicpumhkuj.supabase.co  ->  sb-gbccfqpmoteicpumhkuj-auth-token
 *     https://auth.prettymuch.nz               ->  sb-auth-auth-token
 *
 * So pointing `NEXT_PUBLIC_SUPABASE_URL` at the custom auth domain did not
 * migrate existing sessions — it **orphaned** them. The old cookies stayed on
 * the site's domain and kept being sent, every sign-in added another set, and
 * because a session JWT is chunked across several cookies the Cookie header
 * eventually exceeded Node's 16KB limit. Every authenticated fetch then failed
 * with **431 Request Header Fields Too Large**, which surfaced as a credit
 * balance stuck at 0, an empty gallery and missing past projects.
 *
 * ## Why the name is derived here, not pinned
 *
 * The first attempt at this pinned an explicit name via `cookieOptions`. That
 * broke sign-in completely: there are **nine** Supabase client constructions in
 * this codebase, and pinning two of them meant `lib/auth/oauth-client.ts` wrote
 * the PKCE code verifier under the derived name while the callback looked for
 * it under the pinned one — so the exchange failed and Google sign-in bounced
 * in a loop. The middleware, also unpinned, wrote its refreshed session under
 * the derived name and the cleanup below then deleted it on the same response.
 *
 * Deriving the name the same way the library does means there is exactly one
 * source of truth and no client can disagree with another. If the cookie name
 * ever needs pinning, **every** construction site must be changed in the same
 * commit.
 */

/** Matches any Supabase auth cookie, including `.0`/`.1` chunk suffixes. */
const SUPABASE_AUTH_COOKIE = /^sb-(.+)-auth-token(\.\d+)?$/;

/**
 * The cookie name `@supabase/ssr` will use for this URL. Mirrors the library's
 * own derivation; see the note above for why this is derived rather than fixed.
 */
export function currentAuthCookieName(supabaseUrl: string): string {
  try {
    const label = new URL(supabaseUrl).hostname.split(".")[0];
    return `sb-${label}-auth-token`;
  } catch {
    return "";
  }
}

/**
 * Supabase auth cookies belonging to a *different* project URL — left over from
 * a previous derivation. Callers expire these; a real user would never know to
 * clear cookies themselves.
 *
 * Returns nothing when the current name can't be determined, so a malformed URL
 * can never cause us to delete a live session.
 */
export function staleAuthCookieNames(
  cookies: { name: string }[],
  supabaseUrl: string,
): string[] {
  const current = currentAuthCookieName(supabaseUrl);
  if (!current) return [];
  return cookies
    .map((c) => c.name)
    .filter(
      (name) =>
        SUPABASE_AUTH_COOKIE.test(name) &&
        name !== current &&
        !name.startsWith(`${current}.`),
    );
}
