import type { MetadataRoute } from "next";

/**
 * The public, crawlable surface — marketing and legal only.
 *
 * Everything under `/[workspace]` is authenticated, per-tenant application
 * state; listing any of it would advertise workspace slugs and hand crawlers a
 * wall of redirects to the login page. `robots.ts` disallows the same paths.
 */
const ROUTES = ["", "/about", "/pricing", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://prettymuch.nz";
  const lastModified = new Date();
  return ROUTES.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
