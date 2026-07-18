/**
 * Feature flags — the rails for dark-launching new work.
 *
 * A flag lets a half-built feature merge to `master` and ship to production
 * INVISIBLE, then be switched on with an env change when it's ready. That's what
 * keeps a long-lived branch from rotting against `master` (see the watermark
 * branch for the cost of not doing this): short branches merge behind a flag and
 * never drift.
 *
 * Server-authoritative on purpose. These are read at RUNTIME on the server, not
 * inlined into the client bundle via NEXT_PUBLIC_*. So flipping one in Railway
 * takes effect on the next request after the service restarts — no rebuild, and
 * turning it back off is just as instant. A NEXT_PUBLIC_ flag would bake into
 * the build and need a redeploy to change, and would also leak the flag's
 * existence to anyone reading the bundle.
 *
 * To expose a flag to a CLIENT component, read it in a server component /
 * layout and pass the boolean down as a prop — never import this into
 * "use client" code (it would try to read server env in the browser).
 *
 * Convention: a flag is ON only when its env var is exactly "1". Unset, empty,
 * "0", "true", anything else → OFF. Fail closed, so a typo never dark-launches
 * something by accident.
 */

export type FeatureFlag = "logoBuilder";

/** Flag → the env var that controls it. Add new flags here. */
const FLAG_ENV: Record<FeatureFlag, string> = {
  logoBuilder: "FEATURE_LOGO_BUILDER",
};

/** True only when the flag's env var is exactly "1". */
export function isEnabled(flag: FeatureFlag): boolean {
  return process.env[FLAG_ENV[flag]] === "1";
}

/**
 * Guard for a server component / page: throws Next's notFound() when the flag
 * is off, so a gated route is genuinely absent (a real 404) rather than an
 * empty page. Import next/navigation's notFound at the call site — this stays
 * dependency-free so it's safe to import anywhere on the server.
 *
 *   import { notFound } from "next/navigation";
 *   if (!isEnabled("logoBuilder")) notFound();
 *
 * For an API route, return a 404 Response instead (see app/api/logo/route.ts).
 */
export function flagOr404<T>(
  flag: FeatureFlag,
  whenOn: () => T,
): T | undefined {
  return isEnabled(flag) ? whenOn() : undefined;
}
