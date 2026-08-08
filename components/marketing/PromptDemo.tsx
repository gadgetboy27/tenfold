"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Loader2,
  ArrowRight,
  Image as ImageIcon,
  Video,
  Music,
  Type,
} from "lucide-react";

// Example prompts that mirror the showcase subjects — the demo "types" each one.
const PROMPTS = [
  "A confident founder presenting at a tech conference, golden hour",
  "A 3D sneaker floating on a bold pink-and-blue gradient",
  "A luxury sports car on a neon city street at night",
  "A gourmet burger, dramatic lighting, dark moody background",
];

const OUTPUTS = [
  { icon: ImageIcon, label: "Images" },
  { icon: Video, label: "Video" },
  { icon: Music, label: "Music" },
  { icon: Type, label: "Captions" },
];

export function PromptDemo() {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "generating">("typing");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // window-only check, must run after mount (SSR-safe). Intentional one-shot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(PROMPTS[0]);
      return;
    }
    const full = PROMPTS[idx];
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (text.length < full.length) {
        t = setTimeout(
          () => setText(full.slice(0, text.length + 1)),
          34 + Math.random() * 46,
        );
      } else {
        t = setTimeout(() => setPhase("generating"), 950);
      }
    } else {
      t = setTimeout(() => {
        setText("");
        setPhase("typing");
        setIdx((i) => (i + 1) % PROMPTS.length);
      }, 1700);
    }
    return () => clearTimeout(t);
  }, [text, phase, idx, reduced]);

  const generating = phase === "generating";

  return (
    <section className="px-5 pb-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-5 text-sm font-medium uppercase tracking-[0.2em] text-primary">
          See it in action
        </p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left backdrop-blur shadow-2xl shadow-black/40"
        >
          <div className="pointer-events-none absolute -top-10 left-1/2 -z-10 h-32 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-[80px]" />
          {/* prompt row */}
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-h-6 flex-1 font-mono text-sm text-foreground/90 sm:text-base">
              {text}
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />
            </div>
            <button
              type="button"
              disabled
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating
                </>
              ) : (
                <>
                  Generate <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
          {/* control chips — mirrors the real app */}
          <div className="mt-3 flex flex-wrap gap-2 pl-8 text-xs text-muted-foreground">
            {["1:1", "Photorealistic", "Sharp"].map((c) => (
              <span
                key={c}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
              >
                {c}
              </span>
            ))}
          </div>
        </motion.div>

        {/* outputs — one prompt fans out to all of these (incl. music) */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="text-muted-foreground/60">One prompt →</span>
          {OUTPUTS.map((o) => {
            const Icon = o.icon;
            return (
              <span key={o.label} className="inline-flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-primary" />
                {o.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
