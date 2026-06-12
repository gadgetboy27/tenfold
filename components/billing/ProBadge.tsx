"use client";

import { Crown } from "lucide-react";
import { useEntitlements } from "@/lib/billing/useEntitlements";

/** Premium tier badge — only renders for paid (Pro) workspaces. */
export default function ProBadge() {
  const ent = useEntitlements();
  if (!ent?.isPro) return null;

  return (
    <span
      className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-400/25 to-amber-500/10 text-amber-400 border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.15)]"
      title={`${ent.label} plan — premium tools unlocked`}
    >
      <Crown className="w-3 h-3" />
      {ent.label}
    </span>
  );
}
