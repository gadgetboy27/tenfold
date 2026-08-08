/**
 * The auth cookie name, pinned explicitly rather than derived from the
 * Supabase URL.
 *
 * By default `@supabase/ssr` builds the name from the URL's first hostname
 * label, so `gbccfqpmoteicpumhkuj.supabase.co` gives
 * `sb-gbccfqpmoteicpumhkuj-auth-token`. When `NEXT_PUBLIC_SUPABASE_URL` moved
 * to the custom domain `auth.prettymuch.nz`, the derived name changed to
 * `sb-auth-auth-token` — and the old cookies were **orphaned, not replaced**.
 *
 * They stayed on the `prettymuch.nz` domain and kept being sent with every
 * request, while each new sign-in added another set. A Supabase session JWT is
 * chunked across several cookies, so the Cookie header grew until it passed
 * Node's 16KB limit and the server answered **431 Request Header Fields Too
 * Large**. The visible symptoms were a credit balance stuck at 0, an empty
 * gallery and missing past projects — every authenticated fetch failing at once
 * with nothing in the UI to say why.
 *
 * Pinning the name means changing the Supabase URL again — another custom
 * domain, a project move — can never orphan a session. `stripStaleAuthCookies`
 * below clears the ones already stranded.
 */
export const AUTH_COOKIE_NAME = "sb-prettymuch-auth-token";

/** Matches any Supabase auth cookie, including `.0`/`.1` chunk suffixes. */
const SUPABASE_AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Names of Supabase auth cookies that are NOT the current one — i.e. left over
 * from a previous cookie-name derivation. Returned so the caller can expire
 * them; real users will never know to clear cookies themselves.
 */
export function staleAuthCookieNames(cookies: { name: string }[]): string[] {
  return cookies
    .map((c) => c.name)
    .filter(
      (name) =>
        SUPABASE_AUTH_COOKIE.test(name) &&
        name !== AUTH_COOKIE_NAME &&
        !name.startsWith(`${AUTH_COOKIE_NAME}.`),
    );
}
