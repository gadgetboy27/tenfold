import type { Metadata } from "next";
import { Starfield } from "@/components/marketing/Starfield";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PricingContent } from "@/components/marketing/PricingContent";
import { FAQSection } from "@/components/marketing/FAQSection";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "Pricing — tenfold",
  description:
    "Start free with 50 credits — no card required. Simple credit pricing for AI-generated campaigns: images, video, music and copy, published to 13 platforms.",
};

export default function PricingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
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
