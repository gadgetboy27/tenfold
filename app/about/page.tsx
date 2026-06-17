import type { Metadata } from "next";
import { Starfield } from "@/components/marketing/Starfield";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { AboutContent } from "@/components/marketing/AboutContent";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "About — tenfold",
  description:
    "tenfold turns one prompt into a full campaign — images, video, music and copy, published everywhere. A one-person business should look like a hundred-person brand.",
};

export default function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <Starfield />
      <MarketingNav />
      <main>
        <AboutContent />
      </main>
      <Footer />
    </div>
  );
}
