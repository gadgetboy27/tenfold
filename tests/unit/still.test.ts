import { describe, expect, it } from "vitest";
import { stillLayers } from "@/lib/composition/still";
import type { CompositionDoc, Layer } from "@/lib/composition/layers";

const text = (id: string, t: string, over: Partial<Layer> = {}): Layer =>
  ({
    id,
    kind: "text",
    text: t,
    font: "Inter",
    sizePx: 60,
    color: "#ffffff",
    pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
    scale: 1,
    rotationDeg: 0,
    opacity: 1,
    blend: "normal",
    appearAt: 3,
    disappearAt: 4,
    fadeSec: 0,
    ...over,
  }) as Layer;

const doc = (layers: Layer[], overrides = {}): CompositionDoc => ({
  id: "d",
  aspect: "1:1",
  background: { kind: "image", src: "https://x/bg.jpg" },
  layers,
  overrides,
});

describe("stillLayers", () => {
  it("keeps every layer regardless of its timing — a still has no timeline", () => {
    const out = stillLayers(doc([text("a", "Sale", { appearAt: 8 })]));
    expect(out.map((l) => l.id)).toEqual(["a"]);
  });

  it("drops text that is only whitespace, so it can't paint an empty panel", () => {
    const out = stillLayers(doc([text("a", "Sale"), text("b", "   ")]));
    expect(out.map((l) => l.id)).toEqual(["a"]);
  });

  it("applies this aspect's per-format nudges", () => {
    const out = stillLayers(
      doc([text("a", "Sale")], {
        "1:1": { a: { pos: { mode: "fraction", nx: 0.2, ny: 0.8 } } },
      }),
    );
    expect(out[0].pos).toEqual({ mode: "fraction", nx: 0.2, ny: 0.8 });
  });
});
