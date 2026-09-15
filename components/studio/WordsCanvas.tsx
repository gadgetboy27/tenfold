"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Type } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { CAPTION_LAYER_ID } from "@/lib/composition/layers";
import { DEFAULT_TREATMENT } from "@/lib/composition/words";
import { useCompositorStore } from "@/store/useCompositorStore";
import { AddImageCard } from "./AddImageCard";
import { TextStylePicker } from "./TextStylePicker";
import {
  addCaptionToAd,
  currentAdWords,
  restyleAdText,
  retypeAdWords,
  pickTextTarget,
  textStyleOf,
  WORDS_LAYER_ID,
  type TextStyle,
} from "./adBridge";

/**
 * The Wording tool: every piece of type on the ad, from one panel.
 *
 * You type the exact wording; we draw it. The letters never reach an image
 * model — asking a model for specific text is a request, not a constraint,
 * and it produced "AUNCEAAN FLEANCE" on a brief that never mentioned text.
 *
 * Everything is live and nothing is duplicated. Typing writes to the Words
 * block as you type. "Write a caption" asks Claude for one (the only paid
 * step here) and drops it on the ad as its own block. The ONE row of font /
 * weight / colour pickers styles whichever text is selected on the stage —
 * click the headline, click the caption, same controls — so a second set of
 * pickers per kind of text never has to exist. Where a block sits and how big
 * it is are not settings: drag it, pull its edges.
 */
export function WordsCanvas({
  workspaceSlug,
  campaignId,
  campaignName,
  topic,
  onCaption,
  onSpent,
}: {
  workspaceSlug: string;
  campaignId: string | null;
  campaignName: string;
  /** What the ad is about — the campaign prompt — for the caption. */
  topic: string;
  /** Hands the generated caption up so Publish starts pre-filled. */
  onCaption?: (caption: string) => void;
  onSpent?: () => void;
}) {
  const [text, setText] = useState(() => currentAdWords());
  // The style new words are born with — follows whatever was last picked.
  const [lastStyle, setLastStyle] = useState<TextStyle>({
    font: DEFAULT_TREATMENT.font,
    weight: 400,
    color: DEFAULT_TREATMENT.color,
    scrim: DEFAULT_TREATMENT.scrim,
  });
  const [captioning, setCaptioning] = useState(false);

  // The pickers follow the stage: click a text block and they style that one.
  const hasDoc = useCompositorStore((s) => s.doc !== null);
  const target = useCompositorStore((s) =>
    pickTextTarget(s.doc?.layers, s.selectedLayerId),
  );
  const style = target ? textStyleOf(target) : lastStyle;
  const targetName =
    target?.id === WORDS_LAYER_ID
      ? "your words"
      : target?.id === CAPTION_LAYER_ID
        ? "the caption"
        : target
          ? "the selected text"
          : null;

  // Sync on change, never on mount: mounting must not rewrite a block the
  // canvas may have re-wrapped or the user may have resized.
  const mounted = useRef(false);
  const fallback = useRef(lastStyle);
  useEffect(() => {
    fallback.current = lastStyle;
  }, [lastStyle]);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    retypeAdWords(text, fallback.current);
  }, [text]);

  const apply = (patch: Partial<TextStyle>) => {
    setLastStyle((s) => ({ ...s, ...patch }));
    if (target) restyleAdText(target.id, patch);
  };

  const writeCaption = async () => {
    if (!campaignId || captioning) return;
    setCaptioning(true);
    try {
      const res = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          campaignId,
          type: "script_generation",
          params: {
            imageDescription: (topic || text).trim(),
            businessName: campaignName,
            platform: "instagram",
            tone: "professional",
            maxWords: 60,
          },
        }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: string;
        error?: string;
      };
      if (!res.ok || !data.result) {
        throw new Error(
          res.status === 402
            ? `Not enough credits — this costs ${CREDIT_COSTS.script_generation}.`
            : (data.error ?? "Couldn't write a caption"),
        );
      }
      onSpent?.();
      onCaption?.(data.result);
      if (addCaptionToAd(data.result) === null) {
        toast.error("Caption written — add an image to put it on the ad.");
        return;
      }
      // Hand the pickers the caption straight away.
      useCompositorStore.getState().selectLayer(CAPTION_LAYER_ID);
      toast.success("Caption on your ad — drag it, or restyle it below");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCaptioning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Type className="h-4 w-4" /> Words on the ad
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A headline, your brand name, an offer — it shows on the ad as you
            type. Drag it where you want it; pull its edges to resize.
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
        <button
          type="button"
          onClick={() => void writeCaption()}
          disabled={!campaignId || captioning}
          className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/50 disabled:opacity-50"
        >
          {captioning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {captioning
            ? "Writing…"
            : `Write a caption for me · ${CREDIT_COSTS.script_generation}`}
        </button>
      </div>

      <TextStylePicker
        style={style}
        onChange={apply}
        legend={
          targetName
            ? `Styling ${targetName} — click any text on the ad to switch.`
            : "Style for the next words you add."
        }
      />

      <AddImageCard
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        onSpent={onSpent}
      />
    </div>
  );
}
