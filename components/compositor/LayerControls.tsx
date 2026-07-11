"use client";

import {
  anchorToFraction,
  BLEND_MODES,
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
import { Copy } from "lucide-react";
import { useCompositorStore, type Layer } from "@/store/useCompositorStore";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";

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
export function LayerControls({ layer }: { layer: Layer }) {
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

  return (
    <div className="space-y-3">
      {layer.kind === "text" && (
        <>
          <Row label="Text">
            <Textarea
              value={layer.text}
              onChange={(e) => set({ text: e.target.value })}
              rows={3}
              className="min-h-0 resize-y bg-background text-sm"
              placeholder="One line per row — press Enter to wrap"
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
