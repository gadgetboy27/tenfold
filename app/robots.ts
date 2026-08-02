import type { MetadataRoute } from "next";

/**
 * Keep crawlers on the marketing site. `/api/*` and the auth screens have
 * nothing to index, and `/[workspace]/*` is authenticated per-tenant state —
 * but it lives at the root path segment, so it can't be disallowed by prefix
 * without blocking the marketing pages too. The workspace routes are behind an
 * auth redirect (`app/(dashboard)/[workspace]/layout.tsx`) and are never linked
 * publicly, so they aren't reachable for a crawler in the first place.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/login", "/signup", "/auth/"],
    },
    sitemap: "https://prettymuch.nz/sitemap.xml",
    host: "https://prettymuch.nz",
  };
}
