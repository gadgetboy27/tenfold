"use client";

import Link from "next/link";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Check } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Short name of the locked capability, e.g. "60-second video". */
  feature: string;
  /** One-line explanation of why it's worth it. */
  blurb?: string;
  /** Bullet perks to show. Defaults to the headline commercial perks. */
  perks?: string[];
}

const DEFAULT_PERKS = [
  "Longer video (30s & 60s)",
  "HD / print-ready exports",
  "Watermark-free posts",
  "Priority generation queue",
  "Multiple brand workspaces",
];

export default function UpgradeModal({
  open,
  onClose,
  feature,
  blurb,
  perks,
}: UpgradeModalProps) {
  const { workspaceSlug } = useAppStore();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-primary/30 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-primary/20 to-primary/5 px-6 pt-6 pb-5 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-black/10"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-4 h-4" /> Pro feature
          </div>
          <h3 className="text-lg font-bold text-foreground">
            {feature} is a Pro feature
          </h3>
          {blurb && (
            <p className="text-sm text-muted-foreground mt-1">{blurb}</p>
          )}
        </div>

        <div className="px-6 py-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
            Upgrade unlocks
          </p>
          <ul className="space-y-2 mb-5">
            {(perks ?? DEFAULT_PERKS).map((p) => (
              <li
                key={p}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <Check className="w-4 h-4 text-primary shrink-0" /> {p}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Not now
            </Button>
            <Link
              href={`/${workspaceSlug}/settings/billing`}
              className="flex-1"
            >
              <Button className="w-full gap-2">
                <Sparkles className="w-4 h-4" /> See plans
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
