import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Outbound-fetch guard: the server must never be talked into fetching
 * something on the inside.
 *
 * Several routes fetch a URL a user chose, directly or through a document
 * they control — the website importer, every composition source (`src` on a
 * layer, the background), the fal webhook's result URLs. A URL is not a
 * safe input just because it parses: `http://169.254.169.254/` is the cloud
 * metadata service, `http://10.0.0.5:5432/` is somebody's database, and a
 * public hostname can resolve to either of those (or redirect there). This
 * is the classic SSRF class, and the fix is the same everywhere: resolve the
 * name, refuse private and special-purpose addresses, and re-check on every
 * redirect rather than letting fetch follow them blind.
 *
 * One module, imported by every server-side fetch of user-influenced input.
 * A second copy of this rule is a copy that drifts.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
]);

/** RFC1918, loopback, link-local, CGNAT, multicast, unspecified — v4 and v6. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const l = ip.toLowerCase();
    if (l === "::" || l === "::1") return true;
    // v4-mapped: ::ffff:a.b.c.d
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      l.startsWith("fc") ||
      l.startsWith("fd") || // fc00::/7 unique local
      l.startsWith("fe8") ||
      l.startsWith("fe9") ||
      l.startsWith("fea") ||
      l.startsWith("feb") || // fe80::/10 link-local
      l.startsWith("ff") // multicast
    );
  }
  return true; // not an IP at all — caller resolves first
}

/**
 * Parse + policy-check a URL WITHOUT touching the network: scheme, obvious
 * hostnames, literal IPs. Pure, so the rule is unit-testable.
 */
export function checkUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with credentials are not allowed");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".arpa")
  ) {
    throw new UnsafeUrlError("That address is not reachable from here");
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new UnsafeUrlError("That address is not reachable from here");
  }
  return url;
}

/**
 * Local development runs Supabase on localhost, where every asset URL is a
 * private address by definition. ALLOW_PRIVATE_FETCH=true skips the address
 * policy (scheme and credential checks still apply). Never set in production;
 * the env schema documents it and the health check reports it.
 */
function privateAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_PRIVATE_FETCH === "true"
  );
}

/** Shape check, then resolve and refuse any private answer. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  if (privateAllowed()) {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new UnsafeUrlError("Only http and https URLs are allowed");
    }
    return url;
  }
  const url = checkUrlShape(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return url;
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("That address could not be resolved");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError("That address is not reachable from here");
  }
  return url;
}

const MAX_REDIRECTS = 5;

/**
 * fetch() for user-influenced URLs. Every hop — the first request and each
 * redirect — passes assertPublicUrl, because "public host that 302s to
 * 169.254.169.254" is the textbook bypass of a check done only once.
 *
 * Note: this does not defeat DNS rebinding (a host that answers public on our
 * lookup and private on fetch's). Node's fetch resolves again; closing that
 * fully needs a pinned-IP agent, which is out of scope for a v1 guard and
 * not something this app's threat model has needed yet.
 */
export async function fetchPublic(
  raw: string,
  init: RequestInit = {},
): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, url).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("Too many redirects");
}
