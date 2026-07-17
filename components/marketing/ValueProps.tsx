"use client";

import { motion } from "framer-motion";
import { Zap, Palette, Layers, Wallet } from "lucide-react";

const PROPS = [
  {
    icon: Zap,
    title: "Minutes, not weeks",
    body: "What used to need a photographer, an editor and a scheduler now takes one prompt and a coffee.",
  },
  {
    icon: Palette,
    title: "On-brand, every time",
    body: "Your colours, logo and fonts stamped automatically across every asset and every format.",
  },
  {
    icon: Layers,
    title: "One idea, ten formats",
    body: "Square, story, reel, banner — generate once and resize for every platform in a click.",
  },
  {
    icon: Wallet,
    title: "Pay for what you make",
    body: "Simple credits. No seats, no lock-in. Top up when you need to, subscribe to save.",
  },
];

export function ValueProps() {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            Why teams switch to tenfold
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PROPS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.45, delay: i * 0.07 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-serif text-lg font-bold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
