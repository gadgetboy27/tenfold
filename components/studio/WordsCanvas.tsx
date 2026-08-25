"use client";

import { useState } from "react";
import { Type, Sparkles, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { BRAND_FONTS } from "@/lib/composition/layers";
import {
  WORD_ZONES,
  DEFAULT_TREATMENT,
  type WordTreatment,
} from "@/lib/composition/words";
import { addWordsToAd, currentAdWords } from "./adBridge";

/**
 * The Words tool.
 *
 * You type the exact wording; we draw it. The letters never reach an image
 * model, which is the entire reason this exists — asking a model for specific
 * text is a request, not a constraint, and it produced "AUNCEAAN FLEANCE" on a
 * brief that never mentioned text at all.
 *
 * Claude proposes how the type should LOOK (zone, font, colour, width). It has
 * no field to put letters in, so a suggestion can restyle your headline but can
 * never rewrite it.
 */
export function WordsCanvas({
  workspaceSlug,
  context,
}: {
  workspaceSlug: string;
  /** The campaign prompt — what the ad is about, for judging tone. */
  context: string;
}) {
  // Lazy initial state, not an effect: read whatever is already on the ad ONCE
  // at mount, so the tool edits the existing block rather than starting over —
  // and so retyping mid-edit can never be clobbered by a re-run.
  const [text, setText] = useState(() => currentAdWords());
  const [treatment, setTreatment] = useState<WordTreatment>(DEFAULT_TREATMENT);
  const [suggestions, setSuggestions] = useState<WordTreatment[]>([]);
  const [thinking, setThinking] = useState(false);

  const place = (t: WordTreatment) => {
    if (addWordsToAd(text, t) === null) {
      toast.error(
        text.trim()
          ? "Add an image to your ad first — type needs something to sit on."
          : "Type the wording first.",
      );
      return;
    }
    setTreatment(t);
    toast.success("Placed on your ad");
  };

  const suggest = async () => {
    if (!text.trim()) {
      toast.error("Type the wording first.");
      return;
    }
    setThinking(true);
    try {
      const res = await api("/api/words/treatments", {
        method: "POST",
        body: JSON.stringify({ words: text, context, count: 4 }),
        workspaceSlug,
      });
      const data = (await res.json()) as { treatments?: WordTreatment[] };
      setSuggestions(data.treatments ?? []);
    } catch {
      toast.error("Couldn't fetch ideas — set it yourself below.");
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Type className="h-4 w-4" /> Words
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Type it exactly as it should appear. We draw the letters — they
            never go through the image model, so they can&apos;t come out
            misspelled.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Your headline, offer or brand name…"
          className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary/60"
        />

        <button
          type="button"
          onClick={suggest}
          disabled={thinking}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {thinking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {thinking ? "Designing…" : "Suggest treatments"}
        </button>
        <p className="text-center text-[11px] text-muted-foreground">
          Free — suggestions don&apos;t cost credits
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <span className="text-xs font-medium text-muted-foreground">
            Pick a look
          </span>
          {suggestions.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              onClick={() => place(s)}
              className="flex flex-col gap-1 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/60"
            >
              <span className="flex items-center gap-2 text-xs font-medium">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-border"
                  style={{ background: s.color }}
                />
                {s.name}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {WORD_ZONES.find((z) => z.id === s.zone)?.label} · {s.font}
                {s.scrim ? " · with scrim" : ""}
              </span>
              {s.rationale && (
                <span className="text-[11px] text-muted-foreground/80">
                  {s.rationale}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Manual control. The suggestions are a shortcut, never the only way —
          a user who knows exactly where their logo lock-up goes shouldn't have
          to talk a model into it. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <span className="text-xs font-medium text-muted-foreground">
          Or set it yourself
        </span>

        <label className="text-[11px] text-muted-foreground">Zone</label>
        <div className="grid grid-cols-3 gap-1">
          {WORD_ZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setTreatment({ ...treatment, zone: z.id })}
              className={`rounded-md px-2 py-2 text-[11px] transition-colors ${
                treatment.zone === z.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>

        <label className="text-[11px] text-muted-foreground">Font</label>
        <div className="flex flex-wrap gap-1">
          {BRAND_FONTS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTreatment({ ...treatment, font: f })}
              style={{ fontFamily: `"${f}", sans-serif` }}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                treatment.font === f
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[11px] text-muted-foreground">Colour</label>
          <input
            type="color"
            value={treatment.color}
            onChange={(e) =>
              setTreatment({ ...treatment, color: e.target.value })
            }
            className="h-7 w-12 cursor-pointer rounded border border-border bg-background"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={treatment.scrim}
              onChange={(e) =>
                setTreatment({ ...treatment, scrim: e.target.checked })
              }
            />
            Panel behind text
          </label>
        </div>

        <button
          type="button"
          onClick={() => place(treatment)}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Place on ad
        </button>
      </div>
    </div>
  );
}
