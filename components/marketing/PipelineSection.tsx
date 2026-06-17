"use client";

import { motion } from "framer-motion";
import {
  PenLine,
  Images,
  Target,
  GitBranch,
  Wand2,
  Send,
} from "lucide-react";

const STAGES = [
  { icon: PenLine, title: "Prompt", line: "Describe it once, in plain words." },
  { icon: Images, title: "Generate", line: "Six on-brand images in seconds." },
  { icon: Target, title: "Anchor", line: "Pick your hero shot." },
  { icon: GitBranch, title: "Expand", line: "Branch it into video, music & script." },
  { icon: Wand2, title: "Compose", line: "Stamp your brand. Add the words." },
  { icon: Send, title: "Publish", line: "One click to 13 platforms." },
];

export function PipelineSection() {
  return (
    <section id="pipeline" className="relative px-5 py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-primary">
            The pipeline
          </p>
          <h2 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            From a sentence to a finished campaign
          </h2>
          <p className="mt-4 text-muted-foreground">
            Six steps, one flow. Every step is powered by best-in-class AI —
            stitched together so you never leave the tab.
          </p>
        </div>

        <div className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* connective glow line on large screens */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-primary/30 to-transparent lg:block" />

          {STAGES.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition-colors hover:border-primary/40 hover:bg-white/[0.05]"
              >
                <div className="absolute -right-6 -top-6 font-serif text-7xl font-extrabold text-white/[0.04]">
                  {i + 1}
                </div>
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-serif text-xl font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.line}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
