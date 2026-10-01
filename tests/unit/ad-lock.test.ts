import { beforeEach, describe, expect, it } from "vitest";
import { useCompositorStore } from "@/store/useCompositorStore";
import type { Layer } from "@/lib/composition/layers";

const text = (id: string, t = "Sale"): Layer =>
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
    appearAt: 0,
    disappearAt: null,
    fadeSec: 0,
  }) as Layer;

const start = () => {
  const s = useCompositorStore.getState();
  s.reset();
  s.load({
    id: "d",
    aspect: "1:1",
    background: { kind: "image", src: "https://x/bg.jpg" },
    layers: [text("a")],
  });
};

describe("a locked ad is frozen", () => {
  beforeEach(start);

  it("refuses every kind of edit", () => {
    const s = useCompositorStore.getState();
    s.setLocked(true);
    s.addLayer(text("b"));
    s.updateLayer("a", { text: "Changed" } as never);
    s.removeLayer("a");
    s.setAspect("9:16");
    const doc = useCompositorStore.getState().doc!;
    expect(doc.layers.map((l) => l.id)).toEqual(["a"]);
    expect((doc.layers[0] as { text: string }).text).toBe("Sale");
    expect(doc.aspect).toBe("1:1");
  });

  it("refuses undo and redo, so history can't be used to change it", () => {
    const s = useCompositorStore.getState();
    s.addLayer(text("b")); // a real, undoable edit while unlocked
    s.setLocked(true);
    s.undo();
    expect(useCompositorStore.getState().doc!.layers).toHaveLength(2);
  });

  it("edits work again once unlocked", () => {
    const s = useCompositorStore.getState();
    s.setLocked(true);
    s.addLayer(text("b"));
    s.setLocked(false);
    s.addLayer(text("b"));
    expect(useCompositorStore.getState().doc!.layers).toHaveLength(2);
  });

  it("loading a doc must not clear the lock — AdStage sets it just before load", () => {
    const s = useCompositorStore.getState();
    s.setLocked(true);
    s.load({
      id: "d2",
      aspect: "1:1",
      background: { kind: "image", src: "https://x/bg.jpg" },
      layers: [text("a")],
    });
    expect(useCompositorStore.getState().locked).toBe(true);
  });

  it("opening a different project starts unlocked", () => {
    const s = useCompositorStore.getState();
    s.setLocked(true);
    s.reset();
    expect(useCompositorStore.getState().locked).toBe(false);
  });
});

describe("moving a box that has a per-shape adjustment", () => {
  it("a drag takes effect instead of being overridden (auto-fit regression)", async () => {
    const { effectiveLayer } = await import("@/lib/composition/layers");
    start();
    const s = useCompositorStore.getState();
    // What auto-fit leaves behind: a per-shape position + scale override.
    s.setFormatOverrides("1:1", {
      a: { pos: { mode: "fraction", nx: 0.1, ny: 0.1 }, scale: 0.5 },
    });
    // The user drags it and resizes it — writes through patchLayout.
    s.patchLayout("a", {
      pos: { mode: "fraction", nx: 0.7, ny: 0.8 },
      scale: 0.9,
    });
    const doc = useCompositorStore.getState().doc!;
    const shown = effectiveLayer(doc.layers[0], doc.aspect, doc.overrides);
    expect(shown.pos).toEqual({ mode: "fraction", nx: 0.7, ny: 0.8 });
    expect(shown.scale).toBe(0.9);
  });

  it("fields without an override still edit the shared master", () => {
    start();
    const s = useCompositorStore.getState();
    s.setFormatOverrides("1:1", { a: { scale: 0.5 } });
    s.patchLayout("a", { rotationDeg: 10 });
    const doc = useCompositorStore.getState().doc!;
    expect(doc.layers[0].rotationDeg).toBe(10); // master
    expect(doc.overrides?.["1:1"]?.a).toEqual({ scale: 0.5 }); // untouched
  });

  it("override mode still edits only this shape", () => {
    start();
    const s = useCompositorStore.getState();
    s.setOverrideMode(true);
    s.patchLayout("a", { rotationDeg: 20 });
    const doc = useCompositorStore.getState().doc!;
    expect(doc.layers[0].rotationDeg).toBe(0);
    expect(doc.overrides?.["1:1"]?.a?.rotationDeg).toBe(20);
  });
});
