"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

/** Floating, depth-parallax showcase image. */
function FloatTile({
  src,
  className,
  depth,
  rotate,
}: {
  src: string;
  className: string;
  depth: number;
  rotate: number;
}) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, depth]);
  return (
    <motion.div
      style={{ y, rotate }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.2 + Math.abs(rotate) * 0.04 }}
      className={`absolute overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/60 ${className}`}
    >
      <Image src={src} alt="Made with tenfold" fill className="object-cover" sizes="240px" />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
    </motion.div>
  );
}

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <section ref={ref} className="relative overflow-hidden px-5 pt-36 pb-24 sm:pt-44">
      {/* violet ambient glows */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <div className="pointer-events-none absolute -right-40 top-40 -z-10 h-[400px] w-[400px] rounded-full bg-fuchsia-500/10 blur-[120px]" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Copy */}
        <div className="text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur lg:mx-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI creative pipeline → social publishing
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="font-serif text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
          >
            One prompt.
            <br />
            <span className="bg-gradient-to-r from-primary via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              A whole campaign.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground lg:mx-0"
          >
            tenfold turns a single idea into images, video, music and copy — then
            publishes it to every platform you sell on. No agency. No editing suite.
            Just one sentence.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start"
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 font-medium text-primary-foreground shadow-[0_0_40px_-6px] shadow-primary/70 transition-transform hover:scale-[1.03]"
            >
              Start free — 50 credits
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#pipeline"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3 font-medium text-foreground backdrop-blur transition-colors hover:bg-white/10"
            >
              See how it works
            </a>
          </motion.div>

          <p className="mt-4 text-xs text-muted-foreground">
            No card required · Publish to up to 13 platforms
          </p>
        </div>

        {/* Parallax image cluster */}
        <div className="relative mx-auto hidden h-[460px] w-full max-w-md lg:block">
          <FloatTile src="/landing/hero-founder.jpg" depth={-60} rotate={-5} className="left-0 top-6 h-64 w-44" />
          <FloatTile src="/landing/product-skincare.jpg" depth={60} rotate={4} className="right-2 top-0 h-56 w-40" />
          <FloatTile src="/landing/fashion-flatlay.jpg" depth={-30} rotate={6} className="bottom-0 left-10 h-44 w-44" />
          <FloatTile src="/landing/cafe.jpg" depth={40} rotate={-4} className="bottom-6 right-0 h-44 w-40" />
        </div>
      </div>
    </section>
  );
}
