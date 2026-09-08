"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * "N credits (≈ $X NZD)" for a priced action.
 *
 * Credits are an abstraction, and an abstraction is a bad thing to ask someone
 * to spend without a translation. This is that translation, in one place —
 * BrandImportPanel grew it inline first, and a second copy of the same
 * arithmetic is the exact pattern that has drifted repeatedly in this codebase.
 *
 * Quoted against the CREATOR plan's rate, not the cheapest tier and not a
 * top-up pack. Packs price credits richer, so quoting from one would overstate
 * what the action costs most people; Creator is the plan most workspaces are
 * actually on. It is a guide to magnitude, not an invoice.
 */
export function useCreditEstimate(cost: number, workspaceSlug: string) {
  const [nzd, setNzd] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api("/api/billing", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            plans?: { id: string; priceNzd: number; creditsPerMonth: number }[];
          } | null,
        ) => {
          if (!live) return;
          const creator = d?.plans?.find((p) => p.id === "creator");
          if (creator?.creditsPerMonth) {
            setNzd(
              Math.ceil(cost * (creator.priceNzd / creator.creditsPerMonth)),
            );
          }
        },
      )
      // Silent: a missing dollar figure degrades to the credit count, which is
      // still a real answer. An error toast about pricing while someone is
      // trying to publish would be noise.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [cost, workspaceSlug]);

  return {
    nzd,
    /** "30 credits (≈ $4 NZD)", or just "30 credits" until billing answers. */
    label: nzd ? `${cost} credits (≈ $${nzd} NZD)` : `${cost} credits`,
  };
}
