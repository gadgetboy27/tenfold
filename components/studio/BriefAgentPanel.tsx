"use client";

import { useState } from "react";
import { Loader2, Sparkles, Upload, FolderOpen, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { BriefAssessment } from "@/lib/brief/schema";

/**
 * Guided brief — slice 1. Rendered only when FEATURE_BRIEF_AGENT is on, so the
 * live prompt→publish flow is untouched.
 *
 * The interaction rule this component exists to honour: **it never blocks
 * generating.** No gate, no required fields, no "complete your brief first".
 * The user asked for a check on their prompt, and they get suggestions they
 * can take or ignore. A single "Use this" button applies the improved prompt;
 * everything else is advisory.
 */

const SOURCE_LABEL: Record<string, string> = {
  upload: "upload a file",
  gallery: "pick from your gallery",
  brand_kit: "from your brand kit",
  text: "just type it",
};

export function BriefAgentPanel({
  prompt,
  workspaceSlug,
  onUsePrompt,
}: {
  prompt: string;
  workspaceSlug: string;
  /** Applies the rewritten prompt to the main textarea. */
  onUsePrompt: (next: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BriefAssessment | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  const check = async () => {
    if (prompt.trim().length < 3) return;
    setBusy(true);
    setError("");
    setApplied(false);
    try {
      const res = await api("/api/campaigns/brief", {
        method: "POST",
        body: JSON.stringify({ prompt }),
        workspaceSlug,
      });
      const data = (await res.json()) as {
        assessment?: BriefAssessment;
        error?: string;
      };
      if (!res.ok || !data.assessment) {
        throw new Error(data.error ?? "Couldn't check that just now");
      }
      setResult(data.assessment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check that just now");
    } finally {
      setBusy(false);
    }
  };

  const score = result?.completeness ?? 0;
  const tone =
    score >= 75
      ? "text-emerald-500"
      : score >= 50
        ? "text-amber-400"
        : "text-muted-foreground";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[13px] font-semibold">Check my brief</span>
        <button
          type="button"
          onClick={check}
          disabled={busy || prompt.trim().length < 3}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary/50 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {busy ? "Reading…" : result ? "Check again" : "Check"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Optional — your prompt works as-is. This just suggests what would make
        the results better.
      </p>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {result && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-baseline gap-2">
            <span className={`text-lg font-semibold tabular-nums ${tone}`}>
              {score}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {score >= 75
                ? "ready to go"
                : score >= 50
                  ? "good — a detail or two would sharpen it"
                  : "workable, but worth adding a little"}
            </span>
          </div>

          <p className="text-xs italic text-muted-foreground">
            “{result.understanding}”
          </p>

          {result.gaps.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Worth saying
              </p>
              {result.gaps.map((g) => (
                <div key={g.missing} className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">
                    {g.question}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    e.g. “{g.example}”
                  </p>
                </div>
              ))}
            </div>
          )}

          {result.assetAsks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Have any of these handy?
              </p>
              {result.assetAsks.map((a) => (
                <div
                  key={a.kind}
                  className="rounded-lg border border-border bg-background p-2"
                >
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    {a.sources.includes("gallery") ? (
                      <FolderOpen className="h-3 w-3 text-primary" />
                    ) : (
                      <Upload className="h-3 w-3 text-primary" />
                    )}
                    {a.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {a.reason}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {a.sources.map((s) => SOURCE_LABEL[s] ?? s).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-primary">
              Sharpened version
            </p>
            <p className="text-xs leading-relaxed text-foreground">
              {result.improvedPrompt}
            </p>
            <button
              type="button"
              onClick={() => {
                onUsePrompt(result.improvedPrompt);
                setApplied(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
            >
              {applied ? <Check className="h-3 w-3" /> : null}
              {applied ? "Applied" : "Use this"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
