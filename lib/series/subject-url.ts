/**
 * Is this a picture that lives in THIS workspace's storage?
 *
 * A Series sends the subject's URL to fal, which fetches it. Left open, that is
 * an open proxy (any URL, including internal ones) and a way to use another
 * workspace's pictures. So the subject must be a public object in Supabase
 * Storage whose path carries this workspace's id — which every upload and every
 * generated asset's path does (`uploads/<ws>/…`, `<ws>/<campaign>/…`).
 *
 * Both Storage hosts are accepted: the configured one (the custom domain) and
 * raw `<ref>.supabase.co`, because assets written before the custom domain
 * existed still carry the raw origin forever (see lib/social/media-url.ts).
 */
const PUBLIC_OBJECT_PREFIX = "/storage/v1/object/public/";

export function isWorkspaceStorageUrl(
  url: string,
  workspaceId: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  if (!workspaceId) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  // `https://good.supabase.co@evil.com/` parses with a username; never allow it.
  if (u.username || u.password || u.port) return false;
  if (!u.pathname.startsWith(PUBLIC_OBJECT_PREFIX)) return false;

  let canonicalHost: string | null = null;
  try {
    canonicalHost = supabaseUrl ? new URL(supabaseUrl).host : null;
  } catch {
    canonicalHost = null;
  }
  const hostOk =
    u.host === canonicalHost ||
    (u.hostname.endsWith(".supabase.co") && u.hostname.length > 12);
  if (!hostOk) return false;

  // Whole path segments only — `…/ws-12/…` must not satisfy workspace `ws-1`.
  const segments = u.pathname.slice(PUBLIC_OBJECT_PREFIX.length).split("/");
  return segments.includes(workspaceId);
}
