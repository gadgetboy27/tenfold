import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, PACKS } from "@/lib/billing/plans";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { WELCOME_CREDITS } from "@/lib/auth/provisioning";

// Friendly labels for the credit-cost table — keys come straight from
// CREDIT_COSTS so the numbers can never drift from what the app charges.
const COST_ROWS: { key: keyof typeof CREDIT_COSTS; label: string }[] = [
  { key: "image_generation", label: "Campaign image set (4 images)" },
  { key: "image_variation", label: "Image variation" },
  { key: "upscale", label: "Upscale to high resolution" },
  { key: "video_10s", label: "10-second video" },
  { key: "video_30s", label: "30-second video" },
  { key: "video_60s", label: "60-second video" },
  { key: "music_generation", label: "Music track" },
  { key: "script_generation", label: "Script or caption" },
];

export function PricingContent() {
  return (
    <div className="px-5 pb-28 pt-32">
      {/* ── Hero ── */}
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-primary">
          Pricing
        </p>
        <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
          Pay for what you make
        </h1>
        <p className="mt-4 text-muted-foreground">
          Start free with {WELCOME_CREDITS} credits — no card required. Top up
          as you go, or subscribe for a monthly allowance at better value.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-full border border-primary/50 bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_0_24px_-4px] shadow-primary/60 transition-transform hover:scale-[1.03]"
        >
          Start free — {WELCOME_CREDITS} credits
        </Link>
      </div>

      {/* ── Subscription plans ── */}
      <div className="mx-auto mt-20 grid max-w-5xl gap-5 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl border p-6 backdrop-blur ${
              plan.popular
                ? "border-primary/50 bg-primary/[0.06]"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-primary/50 bg-background px-3 py-0.5 text-xs font-medium text-primary">
                Most popular
              </span>
            )}
            <h2 className="font-serif text-xl font-bold">{plan.name}</h2>
            <p className="mt-3">
              <span className="font-serif text-4xl font-bold">
                ${plan.priceNzd}
              </span>
              <span className="text-sm text-muted-foreground"> NZD/month</span>
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className={`mt-6 block rounded-full border px-4 py-2 text-center text-sm font-medium transition-colors ${
                plan.popular
                  ? "border-primary/50 bg-primary text-primary-foreground hover:opacity-90"
                  : "border-white/15 hover:border-primary/40 hover:text-primary"
              }`}
            >
              Get started
            </Link>
          </div>
        ))}
      </div>

      {/* ── Top-up packs ── */}
      <div className="mx-auto mt-20 max-w-3xl text-center">
        <h2 className="font-serif text-3xl font-bold tracking-tight">
          Prefer no subscription?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Top up credits whenever you need them — no recurring commitment.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {PACKS.map((pack) => (
            <div
              key={pack.credits}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
            >
              <p className="font-serif text-3xl font-bold">
                {pack.credits} credits
              </p>
              <p className="mt-1 text-muted-foreground">
                ${pack.priceNzd} NZD
                {pack.popular && (
                  <span className="ml-2 rounded-full border border-primary/40 px-2 py-0.5 text-xs text-primary">
                    Best value
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── What credits buy ── */}
      <div className="mx-auto mt-20 max-w-2xl">
        <h2 className="text-center font-serif text-3xl font-bold tracking-tight">
          What a credit buys
        </h2>
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur">
          {COST_ROWS.map((row, i) => (
            <div
              key={row.key}
              className={`flex items-center justify-between px-5 py-3.5 text-sm ${
                i > 0 ? "border-t border-white/5" : ""
              }`}
            >
              <span>{row.label}</span>
              <span className="font-medium text-primary">
                {CREDIT_COSTS[row.key]}{" "}
                {CREDIT_COSTS[row.key] === 1 ? "credit" : "credits"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          A full campaign — image set, 10-second video, music and captions —
          costs about 36 credits. On the Creator plan that&apos;s under $3 NZD,
          a fraction of a single agency hour.
        </p>
      </div>
    </div>
  );
}
