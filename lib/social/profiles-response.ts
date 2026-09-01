/**
 * Read GET /api/social/profiles.
 *
 * The route used to return a bare array and now returns
 * `{ profiles, ayrshareEnabled }` — the client cannot read AYRSHARE_ENABLED
 * itself, and without it the settings page kept offering a hosted-linking
 * button whose only possible outcome was an error toast.
 *
 * Three separate callers parsed that array by hand, so the shape change would
 * have broken all three silently: `.map` on an object throws, `.find` returns
 * undefined, and a connections list just renders empty — the same class of
 * quiet breakage as an embed that stops resolving.
 *
 * Generic over the row type on purpose: each caller declares the subset of
 * SocialProfile it actually uses, and there is no shared type to import. The
 * shape of the ENVELOPE is what belongs in one place; the rows are the
 * caller's business.
 *
 * Both shapes are accepted deliberately. A deployed client is older than the
 * route it talks to for as long as a browser tab stays open, and nobody should
 * watch their connections vanish because the server rolled forward underneath
 * them.
 */
export function readProfilesResponse<T>(data: unknown): {
  profiles: T[];
  ayrshareEnabled: boolean;
} {
  if (Array.isArray(data)) {
    // Legacy shape: no flag to read, so assume OFF. Claiming a disabled
    // integration works is precisely the failure this exists to stop.
    return { profiles: data as T[], ayrshareEnabled: false };
  }
  const obj = (data ?? {}) as { profiles?: T[]; ayrshareEnabled?: boolean };
  return {
    profiles: Array.isArray(obj.profiles) ? obj.profiles : [],
    ayrshareEnabled: obj.ayrshareEnabled === true,
  };
}
