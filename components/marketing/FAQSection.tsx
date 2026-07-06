import Link from "next/link";

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

const DEFAULT_ITEMS: FaqItem[] = [
  {
    q: "Do I own what I generate?",
    a: "Yes. Everything you generate on tenfold — images, video, music, captions — is yours to use commercially. It's written into our terms, not buried in them.",
  },
  {
    q: "Which platforms can I publish to?",
    a: "Facebook, Instagram, TikTok, LinkedIn, X (Twitter), YouTube, Pinterest, Google Business Profile and more — 13 platforms in total, all from one publish button.",
  },
  {
    q: "What happens when my free credits run out?",
    a: (
      <>
        You start with 50 free credits — no card required. When they run out,
        top up from $15 or subscribe from $29/month for a monthly credit
        allowance. See{" "}
        <Link href="/pricing" className="text-primary hover:underline">
          pricing
        </Link>{" "}
        for the full breakdown.
      </>
    ),
  },
  {
    q: "Do I need design or editing skills?",
    a: "No. You describe what you want in one sentence; the AI handles composition, video, music and copy. You pick, fine-tune and approve — no design tools involved.",
  },
  {
    q: "Is my brand kit and data secure?",
    a: "Your brand kit, assets and campaigns live in your own private workspace, isolated at the database level. Social accounts connect through secure OAuth — we never see your passwords.",
  },
  {
    q: "Does anything post without my approval?",
    a: "Never. You review every asset and caption, choose the platforms, and hit publish yourself — or schedule it for later. Nothing goes out on its own.",
  },
];

export function FAQSection({ items = DEFAULT_ITEMS }: { items?: FaqItem[] }) {
  return (
    <section id="faq" className="relative px-5 py-28">
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-primary">
            FAQ
          </p>
          <h2 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            Questions, answered
          </h2>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur transition-colors open:border-primary/40 hover:border-primary/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="text-lg text-muted-foreground transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
