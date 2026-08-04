import { Starfield } from "./Starfield";
import { MarketingNav } from "./MarketingNav";
import { Hero } from "./Hero";
import { PromptDemo } from "./PromptDemo";
import { PipelineSection } from "./PipelineSection";
import { ShowcaseSection } from "./ShowcaseSection";
import { ValueProps } from "./ValueProps";
import { FAQSection } from "./FAQSection";
import { CTASection } from "./CTASection";
import { Footer } from "./Footer";
import { StructuredData } from "./StructuredData";
import { PLANS } from "@/lib/billing/plans";
import {
  organizationSchema,
  websiteSchema,
  softwareApplicationSchema,
} from "@/lib/seo/schema";

export function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Who we are, what the site is, and what the product is. FAQPage lives
          on /pricing instead — duplicating it across pages is a Google
          anti-pattern. */}
      <StructuredData
        data={[
          organizationSchema(),
          websiteSchema(),
          softwareApplicationSchema(PLANS),
        ]}
      />
      <Starfield />
      <MarketingNav />
      <main>
        <Hero />
        <PipelineSection />
        <PromptDemo />
        <ShowcaseSection />
        <ValueProps />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
