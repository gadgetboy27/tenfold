"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="px-5 py-28">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-primary/15 to-white/[0.02] px-8 py-16 text-center backdrop-blur"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[600px] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]" />
        <h2 className="font-serif text-4xl font-extrabold tracking-tight sm:text-5xl">
          Your next campaign is
          <br />
          <span className="bg-gradient-to-r from-primary via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            one sentence away.
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-muted-foreground">
          Start free with 50 credits — enough for your first few campaigns. No card,
          no commitment.
        </p>
        <Link
          href="/signup"
          className="group mt-9 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 font-medium text-primary-foreground shadow-[0_0_50px_-8px] shadow-primary/70 transition-transform hover:scale-[1.03]"
        >
          Create your first campaign
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </motion.div>
    </section>
  );
}
