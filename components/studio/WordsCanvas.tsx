"use client";

import { useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";
import { BRAND_FONTS, weightsFor } from "@/lib/composition/layers";
import { DEFAULT_TREATMENT, type WordTreatment } from "@/lib/composition/words";
import { AddImageCard } from "./AddImageCard";
import { adHasDoc, currentAdWords, syncAdWords } from "./adBridge";

/**
 * The Words tool.
 *
 * You type the exact wording; we draw it. The letters never reach an image
 * model, which is the entire reason this exists — asking a model for specific
 * text is a request, not a constraint, and it produced "AUNCEAAN FLEANCE" on a
 * brief that never mentioned text at all.
 *
 * Everything here is live. Type and the words appear on the ad; pick a face or
 * a colour and the ad changes as you pick — there is no "place" step to
 * remember. Where the block sits and how big it is are not settings any more:
 * you drag it on the ad and pull its edges, the same as any other layer. The
 * Zone grid and Size presets this panel used to carry were a second, blunter
 * way of doing what the stage already does with the cursor, so they are gone.
 */
export function WordsCanvas({
  workspaceSlug,
  campaignId,
  onSpent,
}: {
  workspaceSlug: string;
  campaignId: string | null;
  onSpent?: () => void;
}) {
  // Lazy initial state, not an effect: read whatever is already on the ad ONCE
  // at mount, so the tool edits the existing block rather than starting over.
  const [text, setText] = useState(() => currentAdWords());
  const [treatment, setTreatment] = useState<WordTreatment>(DEFAULT_TREATMENT);
  const [hasDoc, setHasDoc] = useState(() => adHasDoc());

  // Sync on change, never on mount: mounting must not rewrite a block the
  // canvas may have re-wrapped or the user may have resized. The ref skips the
  // first run; everything after is a genuine edit.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const outcome = syncAdWords(text, treatment);
    setHasDoc(outcome !== "no-doc");
  }, [text, treatment]);

  const set = (patch: Partial<WordTreatment>) =>
    setTreatment((t) => ({ ...t, ...patch }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Type className="h-4 w-4" /> Words
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A caption, a headline, your brand name — type it exactly as it
            should appear and it shows on the ad as you type. Drag it where you
            want it; pull its edges to resize.
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
        {!hasDoc && (
          <p className="text-[11px] text-amber-500">
            Add an image to your ad first — type needs something to sit on.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <label className="text-[11px] text-muted-foreground">Font</label>
        <div className="flex flex-wrap gap-1">
          {BRAND_FONTS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() =>
                set({
                  font: f,
                  // Drop a Bold this family has no file for.
                  weight: weightsFor(f).includes(treatment.weight ?? 400)
                    ? treatment.weight
                    : 400,
                })
              }
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

        <label className="text-[11px] text-muted-foreground">Weight</label>
        <div className="flex gap-1">
          {weightsFor(treatment.font).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => set({ weight: w })}
              style={{
                fontFamily: `"${treatment.font}", sans-serif`,
                fontWeight: w,
              }}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                (treatment.weight ?? 400) === w
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {w === 700 ? "Bold" : "Regular"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[11px] text-muted-foreground">Colour</label>
          {/* onInput, not just onChange: browsers fire `change` only when the
              picker closes, so the ad wouldn't move until the dialog was
              dismissed — the opposite of live. */}
          <input
            type="color"
            value={treatment.color}
            onInput={(e) => set({ color: e.currentTarget.value })}
            onChange={(e) => set({ color: e.currentTarget.value })}
            className="h-7 w-12 cursor-pointer rounded border border-border bg-background"
          />
          <span
            className="text-sm"
            style={{
              fontFamily: `"${treatment.font}", sans-serif`,
              fontWeight: treatment.weight ?? 400,
              color: treatment.color,
              ...(treatment.scrim
                ? { background: "rgba(0,0,0,0.45)", padding: "0 6px" }
                : {}),
            }}
          >
            {text.trim().split("\n")[0].slice(0, 24) || "Preview"}
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={treatment.scrim}
              onChange={(e) => set({ scrim: e.target.checked })}
            />
            Panel behind
          </label>
        </div>
      </div>

      <AddImageCard
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        onSpent={onSpent}
      />
    </div>
  );
}
