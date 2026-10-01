"use client";

import { useRef } from "react";
import { Plus, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { ensureBrandFontsLoaded } from "@/lib/composition/fonts";
import type { StickerSpec } from "@/lib/composition/sticker";
import type { ImageLayer } from "@/lib/composition/layers";
import { useCompositorStore } from "@/store/useCompositorStore";
import { addStickerToAd, restyleSticker } from "./adBridge";

/**
 * Sticker — the words on a sticker, and the Add button. Its LOOK (face,
 * effect, colour, flips, tilt) is set in the Style toolbox above, which edits
 * whatever is selected; this card only owns what the sticker SAYS. Live like
 * Words: with a sticker selected on the stage, typing here edits it; with
 * nothing selected, Add makes a new one in the look the toolbox is set to.
 */
export function StickerCard({
  draft,
  onDraft,
  target,
}: {
  draft: StickerSpec;
  onDraft: (patch: Partial<StickerSpec>) => void;
  target: (ImageLayer & { sticker: StickerSpec }) | null;
}) {
  const hasDoc = useCompositorStore((s) => s.doc !== null);
  const value = target ? target.sticker.text : draft.text;

  // A PNG is re-drawn per change; a short debounce keeps typing live without
  // rasterising once per character.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edit = (text: string) => {
    const next = text.slice(0, 60);
    onDraft({ text: next });
    if (!target || !next.trim()) return;
    if (pending.current) clearTimeout(pending.current);
    const spec = { ...target.sticker, text: next };
    pending.current = setTimeout(
      () => void restyleSticker(target.id, spec),
      150,
    );
  };

  const add = async () => {
    if (!draft.text.trim()) return;
    await ensureBrandFontsLoaded();
    if (addStickerToAd({ ...draft, text: draft.text.trim() }) === null) {
      toast.error(
        "Add an image to your ad first — a sticker needs something to sit on.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" /> Sticker
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {target
            ? "Editing the selected sticker — its words here, its look in Style above."
            : "A SALE burst, a price, a stamp. Set its look in Style above, then add it and drag it anywhere."}
        </p>
      </div>
      <input
        value={value}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !target) void add();
        }}
        maxLength={60}
        placeholder="SALE · 50% OFF · NEW"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
      />
      {!target && (
        <button
          type="button"
          onClick={() => void add()}
          disabled={!draft.text.trim() || !hasDoc}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add sticker
        </button>
      )}
    </div>
  );
}
