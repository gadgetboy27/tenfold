import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Starfield } from "@/components/marketing/Starfield";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { StructuredData } from "@/components/marketing/StructuredData";
import { GuideArticle, GuideCta } from "@/components/marketing/GuideArticle";
import { GUIDES, getGuide } from "@/lib/marketing/guides";
import { SITE_URL, SITE_NAME, faqPageSchema } from "@/lib/seo/schema";
import { WELCOME_CREDITS } from "@/lib/billing/welcome";

// Static params for every guide: these are pure content with no per-request
// data, so they prerender and serve as static HTML — which is both fastest for
// readers and simplest for crawlers.
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: `${guide.title} — ${SITE_NAME}`,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: `${SITE_URL}/guides/${guide.slug}`,
      type: "article",
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <StructuredData
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description: guide.description,
            datePublished: guide.updated,
            dateModified: guide.updated,
            mainEntityOfPage: `${SITE_URL}/guides/${guide.slug}`,
            author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
            publisher: {
              "@type": "Organization",
              name: SITE_NAME,
              url: SITE_URL,
              logo: {
                "@type": "ImageObject",
                url: `${SITE_URL}/brand/prettymuch-logo-square.png`,
              },
            },
          },
          ...(guide.faq?.length
            ? [faqPageSchema(guide.faq.map((f) => ({ q: f.q, plain: f.a })))]
            : []),
        ]}
      />
      <Starfield />
      <MarketingNav />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to {SITE_NAME}
        </Link>

        <GuideArticle guide={guide} />
        <GuideCta
          heading="Make campaign images you can actually use"
          body={`${SITE_NAME} grants commercial rights to everything you generate. Start with ${WELCOME_CREDITS} free credits — no card required.`}
        />
      </main>
      <Footer />
    </div>
  );
}
