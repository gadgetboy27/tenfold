"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type {
  AnalyzeResult,
  CampaignAngle,
  ResolvedField,
} from "@/components/studio/BrandImportPanel";

/**
 * The spacious, right-canvas counterpart to BrandImportPanel's URL input —
 * split out (2026-07-26) because comparing 4 detailed campaign angles needs
 * real width, which the left control column doesn't have. Rendered by
 * Studio.tsx's CockpitCreate when `websiteAnalysis` state is set; picking an
 * angle calls `onChoose`, which Studio.tsx wires to clear this view and
 * immediately kick off the normal generate() flow with that angle's prompt —
 * this component never calls POST /api/campaigns itself.
 */

const GOAL_LABELS: Record<string, string> = {
  awareness: "Awareness",
  conversion: "Conversion",
  engagement: "Engagement",
  retention: "Retention",
};

export function BrandAnalysisResults({
  result,
  workspaceSlug,
  onChoose,
}: {
  result: AnalyzeResult;
  workspaceSlug: string;
  onChoose: (angle: CampaignAngle) => void;
}) {
  const [kitApplied, setKitApplied] = useState(result.brandKitApplied);
  const [applyingKit, setApplyingKit] = useState(false);

  const applyBrandKit = async () => {
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

  const colorFields: ResolvedField[] = [
    result.proposedBrandKit.primary_color,
    result.proposedBrandKit.secondary_color,
    result.proposedBrandKit.accent_color,
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Your brand kit</span>
          {kitApplied ? (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <ShieldCheck className="h-3.5 w-3.5" /> Applied to your workspace
            </span>
          ) : (
            <button
              type="button"
              onClick={applyBrandKit}
              disabled={applyingKit}
              className="rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {applyingKit ? "Applying…" : "Apply to my Brand Kit"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {colorFields.map((field, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="h-9 w-9 rounded-full border border-border"
                style={{ backgroundColor: field.value }}
              />
              <div className="flex flex-col leading-tight">
                <span className="font-mono text-xs">{field.value}</span>
                <span className="text-[10px] text-muted-foreground">
                  {field.source === "detected" ? "detected" : "AI suggested"}
                </span>
              </div>
            </div>
          ))}
          <div className="ml-2 flex flex-col leading-tight">
            <span className="text-sm font-medium">
              {result.proposedBrandKit.font_family.value}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {result.proposedBrandKit.font_family.source === "detected"
                ? "detected"
                : "AI suggested"}
            </span>
          </div>
        </div>
        {result.proposedBrandKit.tagline && (
          <p className="mt-3 text-sm italic text-muted-foreground">
            &ldquo;{result.proposedBrandKit.tagline}&rdquo;
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">
          Pick a campaign angle to generate
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {result.campaignAngles.map((angle) => (
            <button
              key={angle.id}
              type="button"
              onClick={() => onChoose(angle)}
              className="flex flex-col rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                <span className="font-semibold">{angle.title}</span>
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  {GOAL_LABELS[angle.goal] ?? angle.goal}
                </span>
              </div>
              <p className="mb-2 text-sm text-muted-foreground">
                {angle.strategy}
              </p>
              <p className="mb-1 text-xs">
                <span className="font-medium">Key message: </span>
                <span className="text-muted-foreground">
                  {angle.keyMessage}
                </span>
              </p>
              <p className="mb-3 text-xs">
                <span className="font-medium">Visual style: </span>
                <span className="text-muted-foreground">
                  {angle.visualStyle}
                </span>
              </p>
              <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-primary">
                Use this angle <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
