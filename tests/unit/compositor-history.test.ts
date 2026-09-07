import { describe, it, expect, beforeEach } from "vitest";
import { useCompositorStore } from "@/store/useCompositorStore";
import type { CompositionDoc, Layer } from "@/lib/composition/layers";

/**
 * Undo for the ad.
 *
 * Everything on the stage is placed by hand now — dropped, dragged, restyled —
 * and the only reversal that existed was a bin on each layer, which covers the
 * one action that happens to be "add". Nothing could take back a restyle, a
 * move, an aspect change or a background swap.
 *
 * The history snapshots inside `editDoc`, the single choke point every mutation
 * already ran through. That is the property worth protecting here: an action
 * added later cannot silently escape the history, because it cannot change a
 * doc without going through that function.
 */

const doc = (): CompositionDoc => ({
  id: "doc-1",
  aspect: "1:1",
  background: { kind: "image", src: "https://example.test/bg.png" },
  layers: [],
});

const layer = (id: string): Layer => ({
  id,
  kind: "image",
  src: `https://example.test/${id}.png`,
  pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
  scale: 1,
  rotationDeg: 0,
  opacity: 1,
  blend: "normal",
  appearAt: 0,
  disappearAt: null,
  fadeSec: 0,
});

const s = () => useCompositorStore.getState();

beforeEach(() => {
  s().reset();
  s().load(doc());
});

describe("undo", () => {
  it("takes back an add", () => {
    s().addLayer(layer("a"));
    expect(s().doc?.layers).toHaveLength(1);
    s().undo();
    expect(s().doc?.layers).toHaveLength(0);
  });

  it("takes back a delete — the bin was never reversible before", () => {
    s().addLayer(layer("a"));
    s().removeLayer("a");
    expect(s().doc?.layers).toHaveLength(0);
    s().undo();
    expect(s().doc?.layers.map((l) => l.id)).toEqual(["a"]);
  });

  it("steps back one action at a time, in order", () => {
    s().addLayer(layer("a"));
    s().addLayer(layer("b"));
    s().addLayer(layer("c"));
    s().undo();
    expect(s().doc?.layers.map((l) => l.id)).toEqual(["a", "b"]);
    s().undo();
    expect(s().doc?.layers.map((l) => l.id)).toEqual(["a"]);
    s().undo();
    expect(s().doc?.layers).toHaveLength(0);
  });

  it("does nothing at the bottom of the stack rather than throwing", () => {
    expect(() => s().undo()).not.toThrow();
    expect(s().doc?.layers).toHaveLength(0);
  });

  it("covers edits that are not adds or deletes", () => {
    // The whole reason a per-layer bin wasn't enough.
    s().setAspect("9:16");
    expect(s().doc?.aspect).toBe("9:16");
    s().undo();
    expect(s().doc?.aspect).toBe("1:1");
  });

  it("marks the doc dirty, so the autosave writes the reversal", () => {
    // Left clean, a reload would resurrect the thing you undid.
    s().addLayer(layer("a"));
    s().markSaved();
    expect(s().dirty).toBe(false);
    s().undo();
    expect(s().dirty).toBe(true);
  });

  it("clears a selection pointing at a layer that no longer exists", () => {
    s().addLayer(layer("a")); // addLayer auto-selects it
    expect(s().selectedLayerId).toBe("a");
    s().undo();
    expect(s().selectedLayerId).toBeNull();
  });

  it("keeps a selection that survives the undo", () => {
    s().addLayer(layer("a"));
    s().addLayer(layer("b"));
    s().selectLayer("a");
    s().undo(); // removes "b"; "a" is still there
    expect(s().selectedLayerId).toBe("a");
  });
});

describe("redo", () => {
  it("puts back what undo took", () => {
    s().addLayer(layer("a"));
    s().undo();
    s().redo();
    expect(s().doc?.layers.map((l) => l.id)).toEqual(["a"]);
  });

  it("is discarded by a new edit", () => {
    // The standard rule, and the only one that can't produce a branch the UI
    // has no way to show.
    s().addLayer(layer("a"));
    s().undo();
    expect(s().future).toHaveLength(1);
    s().addLayer(layer("b"));
    expect(s().future).toHaveLength(0);
  });
});

describe("history belongs to one doc", () => {
  it("is cleared by load — undoing into another project's doc would replace this one", () => {
    s().addLayer(layer("a"));
    expect(s().past.length).toBeGreaterThan(0);
    s().load({ ...doc(), id: "doc-2" });
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(0);
  });

  it("is cleared by reset", () => {
    s().addLayer(layer("a"));
    s().reset();
    expect(s().past).toHaveLength(0);
  });
});

describe("the stack is bounded", () => {
  it("keeps the most recent steps and drops the oldest", () => {
    // Unbounded, this is a slow leak nobody attributes to undo.
    for (let i = 0; i < 80; i++) s().addLayer(layer(`l${i}`));
    expect(s().past.length).toBeLessThanOrEqual(50);
    // The most recent step is still reversible, which is what matters.
    s().undo();
    expect(s().doc?.layers).toHaveLength(79);
  });
});
