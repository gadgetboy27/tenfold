"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Globe, Loader2, Wand2, Palette, Film } from "lucide-react";
import { api } from "@/lib/api";
import { CREDIT_COSTS } from "@/lib/credits/costs";

/**
 * "Brand Brain" (PRODUCT_STRATEGY.md §3/§4.6): paste a website URL, get a
 * campaign brief (4 angles) plus a proposed brand palette/font, seeded from
 * app/api/campaigns/analyze-url/route.ts.
 *
 * This panel is input-only (URL field + Analyze button) — lives in
 * CockpitCreate's cramped left control column. The RESULT (brand kit
 * preview + campaign angles) is deliberately NOT rendered here: comparing
 * 4 detailed options needs real width, so results render in the large
 * right-hand canvas instead (components/studio/BrandAnalysisResults.tsx),
 * fed by the `onResult` callback below. See components/studio/Studio.tsx
 * for how `websiteAnalysis` state is lifted to make that possible.
 *
 * Delivers an ON-BRAND campaign (your site's colors/font/tone applied to
 * generated marketing imagery) — not a literal screenshot/walkthrough of
 * the site. That's a separate, unbuilt idea (PRODUCT_STRATEGY.md §5).
 *
 * The NZD cost estimate is fetched from GET /api/billing (server-side,
 * reads lib/billing/plans.ts) rather than importing PLANS directly here —
 * that module documents itself as server-side only (env-var reads at
 * import time), so a client component shouldn't import it. CREDIT_COSTS
 * (lib/credits/costs.ts) has no such restriction — plain numbers, safe
 * client-side, same file the server route itself charges from.
 */

export interface ResolvedField {
  value: string;
  source: "detected" | "ai_suggested";
}

export interface ProposedBrandKit {
  primary_color: ResolvedField;
  secondary_color: ResolvedField;
  accent_color: ResolvedField;
  font_family: ResolvedField;
  tagline: string;
}

export interface CampaignAngle {
  id: string;
  title: string;
  goal: string;
  strategy: string;
  keyMessage: string;
  visualStyle: string;
  imagePrompt: string;
}

export interface AnalyzeResult {
  campaignAngles: CampaignAngle[];
  proposedBrandKit: ProposedBrandKit;
  brandKitApplied: boolean;
  error?: string;
}

export function BrandImportPanel({
  workspaceSlug,
  onResult,
}: {
  workspaceSlug: string;
  onResult: (data: AnalyzeResult) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [nzdEstimate, setNzdEstimate] = useState<number | null>(null);

  const cost = CREDIT_COSTS.brand_import;

  useEffect(() => {
    api("/api/billing", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            plans?: { id: string; priceNzd: number; creditsPerMonth: number }[];
          } | null,
        ) => {
          const creator = d?.plans?.find((p) => p.id === "creator");
          if (creator) {
            setNzdEstimate(
              Math.ceil(cost * (creator.priceNzd / creator.creditsPerMonth)),
            );
          }
        },
      )
      .catch(() => {});
  }, [workspaceSlug, cost]);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await api("/api/campaigns/analyze-url", {
        method: "POST",
        body: JSON.stringify({ url: url.trim() }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as AnalyzeResult;
      if (!res.ok) {
        throw new Error(
          res.status === 402
            ? `Not enough credits — this costs ${cost} credits.`
            : (data.error ?? "Could not analyze that site"),
        );
      }
      onResult(data);
    } catch (err) {
      toast.error((err as Error).message ?? "Could not analyze that site");
    } finally {
      setLoading(false);
    }
  };

  const costLabel = nzdEstimate
    ? `${cost} credits (≈ $${nzdEstimate} NZD)`
    : `${cost} credits`;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <Wand2 className="h-4 w-4 text-primary" />
          Build a campaign from your website
        </div>
        <p className="mb-2.5 text-xs text-muted-foreground">
          Reads your site&apos;s colors, font and content, then drafts 4
          on-brand campaign angles — pick one to generate matching images, then
          branch into video. This matches your site&apos;s look and tone; it
          doesn&apos;t show the site itself in the video (that&apos;s a
          separate, not-yet-built feature).
        </p>
        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Globe className="h-3 w-3 shrink-0" /> 1. Paste your URL
          </span>
          <span className="flex items-center gap-1.5">
            <Palette className="h-3 w-3 shrink-0" /> 2. We detect your
            colors/font, draft 4 campaign angles
          </span>
          <span className="flex items-center gap-1.5">
            <Film className="h-3 w-3 shrink-0" /> 3. Pick one on the right →
            generate images → branch into video, same as any other campaign
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
          placeholder="https://yourbusiness.com"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading || !url.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          Analyze
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {costLabel} — reads your site&apos;s colors, font and content to draft a
        matching campaign. Results appear on the right.
      </p>
    </div>
  );
}
