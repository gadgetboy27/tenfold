"use client";

import { useState } from "react";
import { Film, Lock } from "lucide-react";
import { useCompositorStore } from "@/store/useCompositorStore";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import {
  CAPTION_PRESETS,
  captionPresetLayer,
  type CaptionStyle,
} from "@/lib/composition/caption-presets";
import { CAPTION_LAYER_ID } from "@/lib/composition/layers";

/**
 * Cinema mix, as a preset inside the compositor.
 *
 * This used to be a separate card in Step 4 driving its own FFmpeg render
 * (/api/compositions/video) — a second pipeline running beside the compositor,
 * with no guidance on which one to use. The styles now reshape the compositor's
 * own caption layer, so there is one way to make a film and the presets are a
 * starting point you can then drag, retime, and restyle by hand.
 */
export function CaptionPresetRow({
  caption,
  onUpgrade,
}: {
  /** The campaign caption. Without text there is nothing to style. */
  caption: string | null;
  onUpgrade: () => void;
}) {
  const doc = useCompositorStore((s) => s.doc);
  const replaceLayer = useCompositorStore((s) => s.replaceLayer);
  const addLayer = useCompositorStore((s) => s.addLayer);
  const removeLayer = useCompositorStore((s) => s.removeLayer);
  const ent = useEntitlements();
  // Which preset was applied THIS session. Deliberately not inferred from the
  // layer: once you drag or restyle the caption it is no longer that preset,
  // and claiming otherwise would be a lie. Hooks stay above the early return.
  const [applied, setApplied] = useState<CaptionStyle | null>(null);

  if (!doc || !caption?.trim()) return null;

  const existing = doc.layers.find((l) => l.id === CAPTION_LAYER_ID);

  const apply = (style: CaptionStyle) => {
    setApplied(style);
    const next = captionPresetLayer(style, {
      text: caption,
      aspect: doc.aspect,
      clipDurationSec: doc.background.durationSec ?? 10,
    });
    // "None" means no caption layer at all, matching the FFmpeg preset.
    if (!next) {
      if (existing) removeLayer(CAPTION_LAYER_ID);
      return;
    }
    // Replace in place so the caption keeps its position in the layer stack
    // (and anything stacked above it stays above it).
    if (existing) replaceLayer(CAPTION_LAYER_ID, next);
    else addLayer(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-border bg-card px-3 py-1.5">
      <span
        className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
        title="A starting point — drag, retime, or restyle the caption afterwards."
      >
        <Film className="h-3.5 w-3.5 text-primary" /> Caption
      </span>
      {CAPTION_PRESETS.map((p) => {
        const locked = p.proOnly && !ent?.isPro;
        const active = applied === p.id && !locked;
        return (
          <button
            key={p.id}
            type="button"
            title={locked ? `${p.blurb} — Pro` : p.blurb}
            onClick={() => (locked ? onUpgrade() : apply(p.id))}
            className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-all ${
              active
                ? "border-primary/40 bg-primary/20 text-primary"
                : locked
                  ? "border-transparent text-muted-foreground opacity-70"
                  : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {locked && <Lock className="h-3 w-3" />}
            {p.label}
          </button>
        );
      })}
      <span className="ml-auto hidden text-[11px] text-muted-foreground md:inline">
        drag or restyle after
      </span>
    </div>
  );
}
