import type { Metadata } from "next";
import { Starfield } from "@/components/marketing/Starfield";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { StructuredData } from "@/components/marketing/StructuredData";
import { GuideArticle, GuideCta } from "@/components/marketing/GuideArticle";
import { AI_SOCIAL_CONTENT_PILLAR as pillar } from "@/lib/marketing/pillars";
import { pillarSchema } from "@/lib/seo/schema";
import { WELCOME_CREDITS } from "@/lib/billing/welcome";

// Pillar 1. A static root-level route outranks `[workspace]`, and a
// single-segment path is never auth-gated (lib/auth/public-paths.ts).
export const metadata: Metadata = {
  title: `${pillar.title} — PrettyMuch`,
  description: pillar.description,
  alternates: { canonical: pillar.path },
  openGraph: {
    title: pillar.title,
    description: pillar.description,
    url: pillar.path,
    type: "website",
  },
};

export default function AiSocialMediaContentPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <StructuredData data={pillarSchema(pillar)} />
      <Starfield />
      <MarketingNav />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <GuideArticle guide={pillar} />
        <GuideCta
          heading="Make your first campaign free"
          body={`Start with ${WELCOME_CREDITS} free credits — enough for an image set and a 10 second video. No card required.`}
        />
      </main>
      <Footer />
    </div>
  );
}
