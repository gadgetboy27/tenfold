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
