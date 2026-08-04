/**
 * Which paths the auth middleware may gate.
 *
 * This exists because the workspace test is necessarily loose: a workspace URL
 * is `/{slug}/...`, which is structurally identical to any other two-segment
 * public path. `/guides/do-you-own-ai-generated-images` matched it and 307'd to
 * /login — the page built, prerendered and appeared in the sitemap, but was
 * unreachable to readers and crawlers alike.
 *
 * So every new *public* multi-segment section must be listed here. Keeping the
 * rule as a pure function makes that failure mode testable instead of
 * something you discover from a traffic graph months later.
 */

/** Single-segment public pages (handled before this in the middleware). */
export const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

/**
 * Public sections with sub-paths. These LOOK like `/{workspace}/{page}` and
 * would otherwise be gated.
 */
export const PUBLIC_PREFIXES = ["/guides/"] as const;

/**
 * True when an unauthenticated visitor should be redirected to /login.
 *
 * Order matters: public prefixes are checked before the workspace shape, since
 * both match the same two-segment pattern.
 */
export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return false;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (pathname.startsWith("/dashboard")) return true;
  // A workspace route: /{slug}/{anything}.
  return /^\/[a-z0-9-]+\//.test(pathname);
}
