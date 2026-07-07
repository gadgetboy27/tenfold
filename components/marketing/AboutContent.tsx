"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const PRINCIPLES = [
  {
    k: "Taste, automated",
    v: "AI handles the pixels and the publishing. You keep the taste, the brand and the final say.",
  },
  {
    k: "One tab, end to end",
    v: "Idea, image, video, copy, schedule — no exporting, no re-uploading, no ten browser tabs.",
  },
  {
    k: "Fair by design",
    v: "Transparent credits, no per-seat tax, no annual lock-in. You pay for what you create.",
  },
];

export function AboutContent() {
  return (
    <div className="px-5">
      {/* Manifesto hero */}
      <section className="relative mx-auto max-w-3xl pt-40 pb-20 text-center">
        <div className="pointer-events-none absolute left-1/2 top-10 -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/15 blur-[140px]" />
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-primary"
        >
          About tenfold
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="font-serif text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
        >
          A one-person business should look like a{" "}
          <span className="bg-gradient-to-r from-primary via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            hundred-person brand.
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground"
        >
          Great marketing has always been gated by budget — studios, editors,
          schedulers, agencies. tenfold collapses that whole stack into a single
          prompt, so the quality of your marketing is decided by your ideas, not
          your headcount.
        </motion.p>
      </section>

      {/* Story */}
      <section className="mx-auto max-w-2xl space-y-6 pb-20 text-muted-foreground">
        <h2 className="font-serif text-2xl font-bold text-foreground">
          Why we built it
        </h2>
        <p>
          A founder shouldn&apos;t need to choose between running their business
          and marketing it. Yet the tools have always pulled in opposite
          directions: one app to generate, another to edit, a third to resize, a
          fourth to schedule — each with its own login, its own bill, its own
          learning curve.
        </p>
        <p>
          tenfold is the opposite bet. One creative pipeline — from a
          plain-language prompt to images, video, music and copy — wired
          straight into publishing across every major platform. The hard parts
          happen in the background. What you&apos;re left with is the fun part:
          the idea, and the final call.
        </p>
      </section>

      {/* Founder */}
      <section className="mx-auto max-w-2xl pb-20">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur sm:p-8">
          <h2 className="font-serif text-2xl font-bold text-foreground">
            Who&apos;s behind it
          </h2>
          <p className="mt-3 text-muted-foreground">
            tenfold is built by{" "}
            <span className="font-medium text-foreground">Henry Peti</span>, a
            solo founder in New Zealand — and it&apos;s the product of its own
            promise. One person, one clear idea, and a brand that shows up
            everywhere like a full creative team is behind it. Because now one
            is.
          </p>
          <a
            href="https://www.linkedin.com/in/henry-peti-b57363102/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary transition-colors hover:underline"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
            </svg>
            Connect with Henry on LinkedIn
          </a>
        </div>
      </section>

      {/* Principles */}
      <section className="mx-auto max-w-5xl pb-24">
        <div className="grid gap-5 md:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <motion.div
              key={p.k}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
            >
              <h3 className="font-serif text-lg font-bold">{p.k}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p.v}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl pb-28 text-center">
        <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          See what one prompt can do.
        </h2>
        <Link
          href="/signup"
          className="group mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 font-medium text-primary-foreground shadow-[0_0_50px_-8px] shadow-primary/70 transition-transform hover:scale-[1.03]"
        >
          Start free — 50 credits
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </section>
    </div>
  );
}
