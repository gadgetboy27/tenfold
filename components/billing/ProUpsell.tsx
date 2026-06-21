"use client";

import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import UpgradeModal from "./UpgradeModal";
import { PRO_PERKS } from "@/lib/billing/upsell";

/**
 * Clickable "Pro feature" lock. Replaces the static lock notices on gated panels
 * — clicking opens the benefit-rich UpgradeModal (what you unlock + See plans),
 * so users learn what the upgrade offers at the moment they reach for it.
 */
export default function ProUpsell({
  feature,
  blurb,
}: {
  feature: string;
  blurb?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 text-xs text-muted-foreground bg-secondary/50 border border-border rounded-lg px-3 py-2 hover:border-primary/40 transition-colors text-left"
      >
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1">
          {feature} is a Pro feature —{" "}
          <span className="text-primary font-medium">see what you get</span>
        </span>
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
      </button>
      <UpgradeModal
        open={open}
        onClose={() => setOpen(false)}
        feature={feature}
        blurb={blurb}
        perks={PRO_PERKS}
      />
    </>
  );
}
