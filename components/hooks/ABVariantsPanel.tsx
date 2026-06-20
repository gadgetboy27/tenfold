"use client";

import { useState } from "react";
import { Split, Loader2, Copy, Check } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { CREDIT_COSTS } from "@/lib/credits/costs";

interface Variant {
  angle: string;
  text: string;
}

const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X" },
];
const TONES = ["professional", "casual", "playful"] as const;
const COUNTS = [3, 5, 8];

// A/B Hooks: generate N distinct opening lines, each in a different angle, to
// test which hook performs best. Synchronous Claude call — no polling.
export default function ABVariantsPanel() {
  const { currentCampaignId, workspaceSlug, creditBalance, setCreditBalance } =
    useAppStore();
  const draft = useAppStore((s) => s.abVariantsDraft);
  const patch = useAppStore((s) => s.patchABVariantsDraft);

  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  const validCampaign =
    !!currentCampaignId &&
    currentCampaignId !== "__new__" &&
    currentCampaignId !== "demo";
  const cost = CREDIT_COSTS.hook_variants;

  async function handleGenerate() {
    if (draft.topic.trim().length < 2) {
      toast.error("Tell it what you're promoting first");
      return;
    }
    setStatus("loading");
    try {
      const res = await api("/api/hooks", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId,
          topic: draft.topic,
          platform: draft.platform,
          tone: draft.tone,
          count: draft.count,
        }),
        workspaceSlug,
      });
      const data = (await res.json()) as {
        variants?: Variant[];
        creditCost?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setVariants(data.variants ?? []);
      setCreditBalance(creditBalance - (data.creditCost ?? 0));
      setStatus("idle");
    } catch (e) {
      setStatus("failed");
      toast.error(e instanceof Error ? e.message : "Generation failed");
    }
  }

  async function copy(text: string, i: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Split className="w-4 h-4" />
          </div>
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              A/B Hooks &amp; Headlines
              <InfoHint text="Generates several opening lines, each using a different proven angle (curiosity, urgency, social proof…), so you can A/B test which hook wins." />
            </h3>
            <p className="text-xs text-muted-foreground">
              Distinct hook variants to test — pick the winner for your ad.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded shrink-0">
          {cost} cr
        </span>
      </div>

      <textarea
        value={draft.topic}
        onChange={(e) => patch({ topic: e.target.value })}
        placeholder="What are you promoting? (e.g. a premium puffer jacket that packs into its own pocket)"
        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary/50"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wider">
            Platform
            <InfoHint text="Shapes hook length and style for where the ad will run." />
          </span>
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => patch({ platform: p.id })}
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border transition-colors",
                draft.platform === p.id
                  ? "border-primary/50 text-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => patch({ tone: t })}
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border capitalize transition-colors",
                draft.tone === t
                  ? "border-primary/50 text-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/50",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wider">
            Variants
            <InfoHint text="How many distinct hooks to generate for testing." />
          </span>
          {COUNTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => patch({ count: c })}
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border transition-colors",
                draft.count === c
                  ? "border-primary/50 text-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/50",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {variants.length > 0 && (
        <div className="space-y-2">
          {variants.map((v, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3"
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 rounded px-1.5 py-0.5 mt-0.5">
                {v.angle}
              </span>
              <p className="flex-1 text-sm text-foreground">{v.text}</p>
              <button
                type="button"
                onClick={() => copy(v.text, i)}
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                aria-label="Copy hook"
              >
                {copied === i ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={handleGenerate}
        disabled={status === "loading" || !validCampaign}
        className="w-full gap-2"
      >
        {status === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === "loading"
          ? "Writing hooks…"
          : variants.length > 0
            ? `Regenerate · ${cost} cr`
            : `Generate hooks · ${cost} cr`}
      </Button>
      {!validCampaign && (
        <p className="text-[11px] text-muted-foreground text-center">
          Save or open a campaign first to generate.
        </p>
      )}
    </div>
  );
}
