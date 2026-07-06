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

export function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
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
