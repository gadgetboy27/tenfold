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
        <h2 className="font-serif text-2xl font-bold text-foreground">Why we built it</h2>
        <p>
          A founder shouldn&apos;t need to choose between running their business and
          marketing it. Yet the tools have always pulled in opposite directions: one
          app to generate, another to edit, a third to resize, a fourth to schedule —
          each with its own login, its own bill, its own learning curve.
        </p>
        <p>
          tenfold is the opposite bet. One creative pipeline — from a plain-language
          prompt to images, video, music and copy — wired straight into publishing
          across every major platform. The hard parts happen in the background. What
          you&apos;re left with is the fun part: the idea, and the final call.
        </p>
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
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.v}</p>
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
