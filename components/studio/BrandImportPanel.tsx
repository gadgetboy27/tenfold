"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Globe, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

/**
 * "Brand Brain" (PRODUCT_STRATEGY.md §3/§4.6): paste a website URL, get a
 * campaign brief (4 angles) plus a proposed brand palette/font, seeded from
 * app/api/campaigns/analyze-url/route.ts. Picking an angle hands its
 * imagePrompt back to CockpitCreate's normal prompt textarea/Generate flow
 * unchanged — this panel never calls POST /api/campaigns itself.
 */

interface ResolvedField {
  value: string;
  source: "detected" | "ai_suggested";
}

interface ProposedBrandKit {
  primary_color: ResolvedField;
  secondary_color: ResolvedField;
  accent_color: ResolvedField;
  font_family: ResolvedField;
  tagline: string;
}

interface CampaignAngle {
  id: string;
  title: string;
  goal: string;
  strategy: string;
  imagePrompt: string;
}

interface AnalyzeResult {
  campaignAngles: CampaignAngle[];
  proposedBrandKit: ProposedBrandKit;
  brandKitApplied: boolean;
  error?: string;
}

export function BrandImportPanel({
  workspaceSlug,
  onApplyPrompt,
}: {
  workspaceSlug: string;
  onApplyPrompt: (prompt: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [applyingKit, setApplyingKit] = useState(false);
  const [kitApplied, setKitApplied] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
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
            ? "Not enough credits — this costs 8 credits."
            : (data.error ?? "Could not analyze that site"),
        );
      }
      setResult(data);
      setKitApplied(data.brandKitApplied);
    } catch (err) {
      toast.error((err as Error).message ?? "Could not analyze that site");
    } finally {
      setLoading(false);
    }
  };

  const applyBrandKit = async () => {
    if (!result) return;
    setApplyingKit(true);
    try {
      const kit = result.proposedBrandKit;
      const res = await api("/api/brand-kit", {
        method: "PATCH",
        body: JSON.stringify({
          primary_color: kit.primary_color.value,
          secondary_color: kit.secondary_color.value,
          accent_color: kit.accent_color.value,
          font_family: kit.font_family.value,
          tagline: kit.tagline,
        }),
        workspaceSlug,
      });
      if (!res.ok) throw new Error("Could not apply to your Brand Kit");
      setKitApplied(true);
      toast.success("Applied to your Brand Kit");
    } catch (err) {
      toast.error(
        (err as Error).message ?? "Could not apply to your Brand Kit",
      );
    } finally {
      setApplyingKit(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
        8 credits — reads your site&apos;s colors, font and content to draft a
        matching campaign.
      </p>

      {result && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Brand kit
              </span>
              {kitApplied ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                  <ShieldCheck className="h-3 w-3" /> Applied
                </span>
              ) : (
                <button
                  type="button"
                  onClick={applyBrandKit}
                  disabled={applyingKit}
                  className="rounded-md border border-primary/40 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {applyingKit ? "Applying…" : "Apply to my Brand Kit"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(
                [
                  result.proposedBrandKit.primary_color,
                  result.proposedBrandKit.secondary_color,
                  result.proposedBrandKit.accent_color,
                ] as ResolvedField[]
              ).map((field, i) => (
                <span
                  key={i}
                  title={`${field.value} (${field.source === "detected" ? "detected on your site" : "AI suggested"})`}
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ backgroundColor: field.value }}
                />
              ))}
              <span className="ml-1 text-xs">
                {result.proposedBrandKit.font_family.value}
              </span>
              <span
                className="text-[10px] text-muted-foreground"
                title="Whether each field was read from your site or suggested by AI"
              >
                {result.proposedBrandKit.font_family.source === "detected"
                  ? "· detected"
                  : "· AI suggested"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {result.campaignAngles.map((angle) => (
              <button
                key={angle.id}
                type="button"
                onClick={() => onApplyPrompt(angle.imagePrompt)}
                className="rounded-lg border border-border bg-card p-3 text-left text-sm transition-colors hover:border-primary/50"
              >
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {angle.title}
                </div>
                <p className="text-xs text-muted-foreground">
                  {angle.strategy}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
