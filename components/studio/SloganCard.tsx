"use client";

import { useState } from "react";
import { Loader2, Quote } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { CREDIT_COSTS } from "@/lib/credits/costs";

/**
 * "Write me a slogan" — the short, direct line for the ad itself, as distinct
 * from the caption that goes in the post. You describe what you're selling;
 * three one-sentence options come back, and the first goes straight into the
 * Words box. Tap another to swap it in. Same one-credit job as a caption.
 */
export function SloganCard({
  workspaceSlug,
  campaignId,
  topic,
  onPick,
  onSpent,
}: {
  workspaceSlug: string;
  campaignId: string | null;
  /** The campaign's own prompt — a sensible starting description. */
  topic: string;
  /** Put this slogan into the Words box. */
  onPick: (slogan: string) => void;
  onSpent?: () => void;
}) {
  const [description, setDescription] = useState(topic);
  const [options, setOptions] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const write = async () => {
    if (!campaignId || busy || !description.trim()) return;
    setBusy(true);
    try {
      const res = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          campaignId,
          type: "script_generation",
          params: { kind: "slogan", description: description.trim() },
        }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        options?: string[];
        error?: string;
      };
      if (!res.ok || !data.options?.length) {
        throw new Error(
          res.status === 402
            ? `Not enough credits — this costs ${CREDIT_COSTS.script_generation}.`
            : (data.error ?? "Couldn't write a slogan"),
        );
      }
      onSpent?.();
      setOptions(data.options);
      setChosen(data.options[0]);
      onPick(data.options[0]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <Quote className="h-3.5 w-3.5 text-muted-foreground" /> Slogan
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Describe what you&apos;re promoting and get a short, punchy line for the
        ad — one sentence, much shorter than a caption.
      </p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={400}
        placeholder="e.g. small-batch roasted coffee, delivered fresh in Wellington"
        className="w-full resize-none rounded-lg border border-border bg-card p-2 text-xs outline-none focus:border-primary/60"
      />
      <button
        type="button"
        onClick={() => void write()}
        disabled={!campaignId || busy || !description.trim()}
        className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary/50 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {busy
          ? "Writing…"
          : options.length
            ? `Write 3 more · ${CREDIT_COSTS.script_generation}`
            : `Write me a slogan · ${CREDIT_COSTS.script_generation}`}
      </button>
      {options.length > 0 && (
        <div className="flex flex-col gap-1">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                setChosen(o);
                onPick(o);
              }}
              className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                chosen === o
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
