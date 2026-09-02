/**
 * Serve media from the host a platform has actually been told to trust.
 *
 * TikTok's `PULL_FROM_URL` fetches the video itself, and only from a domain
 * verified in its developer portal. That verification is a DNS/file proof, so
 * it can only ever be granted for a domain we own — `auth.prettymuch.nz`, the
 * Supabase custom domain — never for `<ref>.supabase.co`.
 *
 * Both hosts serve the same objects at the same paths (verified: identical
 * bytes, both honour range requests). But 302 of this project's assets were
 * written before the custom domain was configured and carry the raw
 * `<ref>.supabase.co` origin in `assets.url` forever. Handing one of those to
 * TikTok fails the domain check, and the error it returns reads like a broken
 * URL rather than an unverified host — which is a long afternoon.
 *
 * Rewriting the ORIGIN at publish time fixes every one of them without a data
 * migration, and keeps working for rows written before any future host change.
 * The canonical host is read from NEXT_PUBLIC_SUPABASE_URL rather than
 * hardcoded, because that is the same value `getPublicUrl()` builds new asset
 * URLs from — so the two cannot drift apart.
 */

/** Storage's public object prefix. Only these paths are safe to re-point. */
const PUBLIC_OBJECT_PREFIX = "/storage/v1/object/public/";

/**
 * Re-point a Supabase Storage URL at the configured public host.
 *
 * Returns the input UNCHANGED for anything it doesn't positively recognise —
 * a non-Storage URL, an unparseable string, or a missing env var. A publish
 * must never fail because this helper got clever: the worst case for leaving a
 * URL alone is the behaviour we already had.
 *
 * Idempotent: a URL already on the canonical host comes back identical.
 */
export function canonicalMediaUrl(url: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return url;
  try {
    const target = new URL(url);
    // Only Storage's public objects. A signed URL carries its signature in the
    // query string and is bound to the host that signed it, and an arbitrary
    // third-party URL is none of our business.
    if (!target.pathname.startsWith(PUBLIC_OBJECT_PREFIX)) return url;
    const canonical = new URL(base);
    if (target.host === canonical.host) return url;
    target.protocol = canonical.protocol;
    target.host = canonical.host;
    target.port = canonical.port;
    return target.toString();
  } catch {
    return url;
  }
}
