import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { landingDocSchema, type LandingDoc } from "@/lib/landing/blocks";
import { LandingPageView } from "@/components/landing/LandingPageView";
import { SITE_URL } from "@/lib/seo/schema";

/**
 * The public campaign landing page — prettymuch.nz/p/<slug>.
 *
 * Served from the app we already run rather than a bucket, a subdomain or a
 * custom domain (docs/landing-pages-scope.md §1). Those all mean DNS, TLS
 * issuance, verification and renewal, which is infrastructure rather than a
 * feature; app/guides/[slug] is the precedent that a public, indexable,
 * server-rendered route already lives here.
 *
 * Reads through the service-role client because there is no session: the page
 * is public by definition. The `published_at IS NOT NULL` filter is therefore
 * the ONLY thing standing between a draft and the internet — it belongs on
 * every query in this file and nowhere else is it enforced.
 */

// Always fresh. A landing page gets edited in response to how it performs, and
// serving a cached copy of yesterday's headline against today's ad spend is a
// worse failure than a slightly slower first byte.
export const dynamic = "force-dynamic";

interface PageRow {
  slug: string;
  style: string;
  title: string;
  description: string;
  blocks: unknown;
  theme: unknown;
}

async function loadPage(
  slug: string,
): Promise<{ doc: LandingDoc; slug: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("landing_pages")
    .select("slug, style, title, description, blocks, theme")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  if (!data) return null;

  const row = data as PageRow;
  const parsed = landingDocSchema.safeParse({
    style: row.style,
    title: row.title,
    description: row.description,
    blocks: row.blocks,
    theme: row.theme,
  });
  // A row that no longer parses is a schema change that outran its data. 404
  // rather than rendering half a page: a broken page under live ad spend is
  // worse than a missing one, because it still costs per click.
  if (!parsed.success) return null;
  return { doc: parsed.data, slug: row.slug };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) return { title: "Not found" };

  const hero = page.doc.blocks.find((b) => b.kind === "hero");
  return {
    // No " — prettymuch.nz" suffix, unlike every other route here. This page
    // belongs to the customer's business; putting our name in their tab title
    // and their link previews would be advertising ourselves on advertising
    // they paid for.
    title: page.doc.title,
    description: page.doc.description,
    alternates: { canonical: `${SITE_URL}/p/${page.slug}` },
    openGraph: {
      title: page.doc.title,
      description: page.doc.description,
      url: `${SITE_URL}/p/${page.slug}`,
      type: "website",
      // Named explicitly, not left to inherit. The root layout declares
      // siteName "PrettyMuch" and an og-card of ours; a share of THIS page
      // carrying our branding would be us advertising on traffic the customer
      // paid for.
      siteName: page.doc.theme.businessName || undefined,
      images:
        hero?.kind === "hero" && hero.imageUrl ? [hero.imageUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: page.doc.title,
      description: page.doc.description,
      images:
        hero?.kind === "hero" && hero.imageUrl ? [hero.imageUrl] : undefined,
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();

  return <LandingPageView doc={page.doc} slug={page.slug} />;
}
