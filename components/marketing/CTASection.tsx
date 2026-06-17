"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

// The real platforms tenfold publishes to (via Ayrshare), with their brand colors.
const PLATFORMS = [
  { id: "instagram", short: "IG", label: "Instagram", color: "#E1306C" },
  { id: "facebook", short: "FB", label: "Facebook", color: "#1877F2" },
  { id: "twitter", short: "X", label: "X", color: "#ffffff" },
  { id: "linkedin", short: "LI", label: "LinkedIn", color: "#0A66C2" },
  { id: "youtube", short: "YT", label: "YouTube", color: "#FF0000" },
  { id: "tiktok", short: "TT", label: "TikTok", color: "#69C9D0" },
  { id: "pinterest", short: "PI", label: "Pinterest", color: "#E60023" },
  { id: "gmb", short: "GB", label: "Google Business", color: "#4285F4" },
];

export function CTASection() {
  return (
    <section className="px-5 py-28">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-primary/15 to-white/[0.02] px-8 py-16 text-center backdrop-blur"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[600px] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]" />

        <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-primary">
          One click to everywhere
        </p>
        <h2 className="font-serif text-4xl font-extrabold tracking-tight sm:text-5xl">
          Made once.
          <br />
          <span className="bg-gradient-to-r from-primary via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Published everywhere.
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-muted-foreground">
          Your finished campaign posts straight to every platform you sell on —
          up to 13 — in a single click. No downloads, no reformatting, no
          copy-paste between apps.
        </p>

        {/* Platform badges — the socials, in all their glory */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {PLATFORMS.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              title={p.label}
              className="group relative flex h-12 w-12 items-center justify-center rounded-full border bg-white/[0.04] text-sm font-semibold backdrop-blur transition-transform hover:scale-110"
              style={{ borderColor: `${p.color}55`, color: p.color }}
            >
              <span
                className="pointer-events-none absolute inset-0 rounded-full opacity-0 blur-md transition-opacity group-hover:opacity-40"
                style={{ background: p.color }}
              />
              {p.short}
            </motion.div>
          ))}
          <span className="inline-flex h-12 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-muted-foreground backdrop-blur">
            + more
          </span>
        </div>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <Check className="h-4 w-4" />
          Select your platforms, publish to all of them at once
        </div>

        <div className="mt-10">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 font-medium text-primary-foreground shadow-[0_0_50px_-8px] shadow-primary/70 transition-transform hover:scale-[1.03]"
          >
            Start free — 50 credits
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No card required · Connect your accounts in minutes
        </p>
      </motion.div>
    </section>
  );
}
