import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/marketing/guides";
import { SITE_URL } from "@/lib/seo/schema";

/**
 * The public, crawlable surface — marketing, legal and guides.
 *
 * Everything under `/[workspace]` is authenticated, per-tenant application
 * state; listing any of it would advertise workspace slugs and hand crawlers a
 * wall of redirects to the login page. `robots.ts` disallows the same paths.
 *
 * Guides carry their own `updated` date rather than "now" — a sitemap that
 * claims every page changed today teaches crawlers to distrust the signal, and
 * lastModified is one of the few hints that genuinely affects recrawl rate.
 */
const ROUTES = ["", "/about", "/pricing", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));

  const guides: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    lastModified: new Date(g.updated),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...pages, ...guides];
}
