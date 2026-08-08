import type { Metadata } from "next";
import { Starfield } from "@/components/marketing/Starfield";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PricingContent } from "@/components/marketing/PricingContent";
import { FAQSection, FAQ_ITEMS } from "@/components/marketing/FAQSection";
import { StructuredData } from "@/components/marketing/StructuredData";
import { faqPageSchema, faqPlain } from "@/lib/seo/schema";
import { Footer } from "@/components/marketing/Footer";
import { WELCOME_CREDITS } from "@/lib/billing/welcome";

export const metadata: Metadata = {
  title: "Pricing — PrettyMuch",
  alternates: { canonical: "/pricing" },
  description: `Start free with ${WELCOME_CREDITS} credits — no card required. Simple credit pricing for AI-generated campaigns: images, video, music and copy, published to 13 platforms.`,
};

export default function PricingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <StructuredData
        data={faqPageSchema(
          FAQ_ITEMS.map((i) => ({ q: i.q, plain: faqPlain(i) })),
        )}
      />
      <Starfield />
      <MarketingNav />
      <main>
        <PricingContent />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
}
