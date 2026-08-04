import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Starfield } from "@/components/marketing/Starfield";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { StructuredData } from "@/components/marketing/StructuredData";
import { GUIDES, getGuide } from "@/lib/marketing/guides";
import { SITE_URL, SITE_NAME } from "@/lib/seo/schema";

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
        data={{
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
        }}
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

        <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Updated{" "}
          {new Date(guide.updated).toLocaleDateString("en-NZ", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>

        {/* The direct answer, up front. Burying it below preamble costs both
            readers and the answer engines that increasingly surface pages. */}
        <p className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-5 text-[15px] leading-relaxed text-foreground">
          {guide.answer}
        </p>

        <div className="mt-10 space-y-10">
          {guide.sections.map((s) => (
            <section key={s.heading} className="space-y-3">
              <h2 className="text-xl font-semibold">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p
                  key={i}
                  className="text-[15px] leading-relaxed text-muted-foreground"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm font-semibold text-foreground">
            Make campaign images you can actually use
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {SITE_NAME} grants commercial rights to everything you generate.
            Start with 50 free credits — no card required.
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            Get started free
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
