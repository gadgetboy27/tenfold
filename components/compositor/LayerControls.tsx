"use client";

import { useState } from "react";
import {
  anchorToFraction,
  BLEND_MODES,
  type CompositeProvenance,
  type EffectInKind,
  type EffectLoopKind,
  type EffectOutKind,
  type LayerAnchor,
} from "@/lib/composition/layers";
import {
  EFFECTS_IN,
  EFFECTS_LOOP,
  EFFECTS_OUT,
  effectsOf,
} from "@/lib/composition/effects";
import toast from "react-hot-toast";
import { Copy, Lock, Sparkles, Loader2 } from "lucide-react";
import { useCompositorStore, type Layer } from "@/store/useCompositorStore";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

const RELIGHT_DIRECTIONS = ["None", "Left", "Right", "Top", "Bottom"] as const;

/**
 * Redo panel for a layer produced by an Image Compositing op — editable text/
 * direction inputs, reusing the structural inputs (mask, blended images) from
 * the original run. Rendered only when the layer is unlocked.
 */
function RedoPanel({
  provenance,
  onRedo,
  redoing,
}: {
  provenance: CompositeProvenance;
  onRedo: (
    op: CompositeProvenance["op"],
    params: Record<string, unknown>,
  ) => void;
  redoing: boolean;
}) {
  const params = provenance.params ?? {};
  const [prompt, setPrompt] = useState(
    typeof params.prompt === "string" ? params.prompt : "",
  );
  const [direction, setDirection] = useState<
    (typeof RELIGHT_DIRECTIONS)[number]
  >((params.direction as (typeof RELIGHT_DIRECTIONS)[number]) ?? "None");

  const opLabel: Record<CompositeProvenance["op"], string> = {
    cutout: "Cutout",
    inpaint: "Erase & replace",
    relight: "Relight",
    blend: "Blend",
  };

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Redo {opLabel[provenance.op]}
      </div>
      {(provenance.op === "inpaint" ||
        provenance.op === "relight" ||
        provenance.op === "blend") && (
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="Describe what you want…"
          className="bg-background text-sm"
        />
      )}
      {provenance.op === "relight" && (
        <select
          value={direction}
          onChange={(e) =>
            setDirection(e.target.value as (typeof RELIGHT_DIRECTIONS)[number])
          }
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          {RELIGHT_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d === "None" ? "Auto lighting direction" : `Light from ${d}`}
            </option>
          ))}
        </select>
      )}
      {(provenance.op === "inpaint" || provenance.op === "blend") && (
        <p className="text-[11px] text-muted-foreground">
          {provenance.op === "inpaint"
            ? "Reuses the same masked region — redraw the mask isn't supported yet."
            : "Reuses the same blended images — swapping images isn't supported yet."}
        </p>
      )}
      <Button
        size="sm"
        disabled={redoing}
        onClick={() =>
          onRedo(provenance.op, {
            ...params,
            ...(prompt ? { prompt } : {}),
            ...(provenance.op === "relight" ? { direction } : {}),
          })
        }
        className="w-full gap-1.5"
      >
        {redoing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Regenerate
      </Button>
    </div>
  );
}

const FONTS = ["Inter", "Montserrat", "Playfair Display", "Lora", "Roboto"];

// 3×3 anchor grid order (top row → bottom row).
const ANCHOR_GRID: LayerAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs leading-tight text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Property editor for the selected layer (position edits happen on canvas). */
export function LayerControls({
  layer,
  onRedo,
  redoing = false,
}: {
  layer: Layer;
  /** Wired only by callers that can actually re-run a compositing op (Studio's
   *  CompositorCanvas). Absent in the classic Compositor page — a producedBy
   *  layer there just shows as a locked/unlockable plain image layer. */
  onRedo?: (
    op: CompositeProvenance["op"],
    params: Record<string, unknown>,
  ) => void;
  redoing?: boolean;
}) {
  const updateLayer = useCompositorStore((s) => s.updateLayer);
  const patchLayout = useCompositorStore((s) => s.patchLayout);
  const layerCount = useCompositorStore((s) => s.doc?.layers.length ?? 0);
  const aspect = useCompositorStore((s) => s.doc?.aspect ?? "9:16");
  const set = (patch: Parameters<typeof updateLayer>[1]) =>
    updateLayer(layer.id, patch);
  // Layout edits (position/size/rotation) go through patchLayout so they honour
  // override mode — matching the canvas drag/resize behaviour.
  const setLayout = (patch: Parameters<typeof patchLayout>[1]) =>
    patchLayout(layer.id, patch);

  // Position mode: "Float" reflows proportionally with the frame; "Pin" locks
  // the layer to a corner/edge with a constant margin, so a logo holds its spot
  // in every format.
  const pos = layer.pos;
  const pin = (anchor: LayerAnchor) => {
    const mx = pos.mode === "anchor" ? pos.mx : 0.05;
    const my = pos.mode === "anchor" ? pos.my : 0.05;
    setLayout({ pos: { mode: "anchor", anchor, mx, my } });
  };
  const float = () => {
    if (pos.mode !== "anchor") return;
    setLayout({
      pos: {
        mode: "fraction",
        ...anchorToFraction(pos.anchor, pos.mx, pos.my, aspect),
      },
    });
  };

  // Materialised effects (maps legacy fadeSec on old layers); edits always
  // write the explicit effects object.
  const fx = effectsOf(layer);
  const setFx = (patch: Partial<typeof fx>) =>
    set({ effects: { ...fx, ...patch }, fadeSec: 0 });

  // Effects stay per-layer (staggered choreography is what looks pro), but
  // one click copies this layer's Enter/Exit/On-screen setup to every other
  // layer for the times they should move as a unit. Each layer keeps its own
  // appear/disappear times.
  const copyEffectsToAll = () => {
    const doc = useCompositorStore.getState().doc;
    if (!doc) return;
    for (const l of doc.layers) {
      if (l.id !== layer.id) updateLayer(l.id, { effects: fx, fadeSec: 0 });
    }
    toast.success("Effects copied to all layers.");
  };

  // Locked (Photoshop-style): editing is fully blocked here too, not just
  // canvas click-through — unlock to manipulate or redo. Matches the ask that
  // a locked layer must actually be protected, not just harder to drag.
  if (layer.locked) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-4 text-center">
        <Lock className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          This layer is locked — unlock it to move, resize, or redo it.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => set({ locked: false })}
        >
          Unlock
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {layer.kind === "image" && layer.producedBy && onRedo && (
        <RedoPanel
          provenance={layer.producedBy}
          onRedo={onRedo}
          redoing={redoing}
        />
      )}
      {layer.kind === "text" && (
        <>
          <Row label="Text">
            <Textarea
              value={layer.text}
              onChange={(e) => set({ text: e.target.value })}
              // Auto-grow to fit the text — never a fixed, scrolling box. Sizing
              // the text on the canvas is done by dragging the layer's handles.
              ref={(el) => {
                if (!el) return;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              className="min-h-0 resize-none overflow-hidden bg-background text-sm"
              placeholder="Type your text — the box grows to fit"
            />
          </Row>
          <Row label="Font">
            <select
              value={layer.font}
              onChange={(e) => set({ font: e.target.value as never })}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Size">
            <Slider
              min={16}
              max={240}
              step={1}
              value={[layer.sizePx]}
              onValueChange={([v]) => setLayout({ sizePx: v })}
            />
          </Row>
          <Row label="Colour">
            <input
              type="color"
              value={layer.color}
              onChange={(e) => set({ color: e.target.value })}
              className="h-8 w-14 cursor-pointer rounded border border-border bg-background"
            />
          </Row>
        </>
      )}

      <Row label="Position">
        <div className="space-y-1.5">
          <div className="flex gap-1">
            <button
              onClick={float}
              className={`flex-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                pos.mode === "fraction"
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              title="Reflow proportionally with each format"
            >
              Float
            </button>
            <button
              onClick={() =>
                pin(pos.mode === "anchor" ? pos.anchor : "bottom-right")
              }
              className={`flex-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                pos.mode === "anchor"
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              title="Pin to a corner/edge with a constant margin in every format"
            >
              Pin
            </button>
          </div>
          {pos.mode === "anchor" && (
            <div className="grid w-fit grid-cols-3 gap-0.5">
              {ANCHOR_GRID.map((a) => (
                <button
                  key={a}
                  onClick={() => pin(a)}
                  title={a}
                  className={`h-5 w-5 rounded-sm border transition-colors ${
                    pos.anchor === a
                      ? "border-primary bg-primary"
                      : "border-border bg-background hover:border-primary/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </Row>
      <Row label="Scale">
        <Slider
          min={0.05}
          max={3}
          step={0.01}
          value={[layer.scale]}
          onValueChange={([v]) => setLayout({ scale: v })}
        />
      </Row>
      <Row label="Rotation">
        <div className="flex items-center gap-2">
          <Slider
            min={-180}
            max={180}
            step={15}
            value={[layer.rotationDeg]}
            onValueChange={([v]) => setLayout({ rotationDeg: v })}
          />
          <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {layer.rotationDeg}°
          </span>
        </div>
      </Row>
      <Row label="Opacity">
        <div className="flex items-center gap-2">
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[layer.opacity]}
            onValueChange={([v]) => set({ opacity: v })}
          />
          <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(layer.opacity * 100)}%
          </span>
        </div>
      </Row>
      <Row label="Blend">
        <select
          value={layer.blend}
          onChange={(e) => set({ blend: e.target.value as never })}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          {BLEND_MODES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </Row>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <label className="text-xs text-muted-foreground">
          Appear (s)
          <Input
            type="number"
            min={0}
            step={0.1}
            value={layer.appearAt}
            onChange={(e) => set({ appearAt: Math.max(0, +e.target.value) })}
            className="mt-1 h-8 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Disappear (s)
          <Input
            type="number"
            min={0}
            step={0.1}
            placeholder="end"
            value={layer.disappearAt ?? ""}
            onChange={(e) =>
              set({
                disappearAt:
                  e.target.value === "" ? null : Math.max(0, +e.target.value),
              })
            }
            className="mt-1 h-8 text-sm"
          />
        </label>
      </div>

      {/* ── Effects suite ── */}
      <div className="space-y-3 border-t border-border pt-3">
        <Row label="Enter">
          <select
            value={fx.in.kind}
            onChange={(e) =>
              setFx({
                in: { ...fx.in, kind: e.target.value as EffectInKind },
              })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {Object.entries(EFFECTS_IN).map(([id, e]) => (
              <option key={id} value={id}>
                {e.label}
              </option>
            ))}
          </select>
        </Row>
        {fx.in.kind !== "none" && (
          <Row label="↳ over">
            <div className="flex items-center gap-2">
              <Slider
                min={0.1}
                max={5}
                step={0.1}
                value={[fx.in.durationSec]}
                onValueChange={([v]) =>
                  setFx({ in: { ...fx.in, durationSec: v } })
                }
              />
              <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {fx.in.durationSec.toFixed(1)}s
              </span>
            </div>
          </Row>
        )}
        <Row label="Exit">
          <select
            value={fx.out.kind}
            onChange={(e) =>
              setFx({
                out: { ...fx.out, kind: e.target.value as EffectOutKind },
              })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {Object.entries(EFFECTS_OUT).map(([id, e]) => (
              <option key={id} value={id}>
                {e.label}
              </option>
            ))}
          </select>
        </Row>
        {fx.out.kind !== "none" && (
          <Row label="↳ over">
            <div className="flex items-center gap-2">
              <Slider
                min={0.1}
                max={5}
                step={0.1}
                value={[fx.out.durationSec]}
                onValueChange={([v]) =>
                  setFx({ out: { ...fx.out, durationSec: v } })
                }
              />
              <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {fx.out.durationSec.toFixed(1)}s
              </span>
            </div>
          </Row>
        )}
        <Row label="On screen">
          <select
            value={fx.loop}
            onChange={(e) => setFx({ loop: e.target.value as EffectLoopKind })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {Object.entries(EFFECTS_LOOP).map(([id, e]) => (
              <option key={id} value={id}>
                {e.label}
              </option>
            ))}
          </select>
        </Row>
        {layer.kind === "text" && fx.in.kind.startsWith("spin") && (
          <p className="text-[11px] text-muted-foreground">
            Note: spin/rotate effects apply to images only in the exported MP4.
          </p>
        )}
        {layerCount > 1 && (
          <button
            onClick={copyEffectsToAll}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            title="Give every layer this Enter / Exit / On-screen setup (their own appear and disappear times are kept)"
          >
            <Copy className="h-3.5 w-3.5" /> Copy these effects to all layers
          </button>
        )}
      </div>
    </div>
  );
}
