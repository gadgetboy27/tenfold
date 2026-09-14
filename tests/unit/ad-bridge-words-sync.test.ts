import { describe, it, expect, beforeEach } from "vitest";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  syncAdWords,
  WORDS_LAYER_ID,
  currentAdWords,
} from "@/components/studio/adBridge";
import { DEFAULT_TREATMENT } from "@/lib/composition/words";

/**
 * The Words tool is live: type and it's on the ad, restyle and the ad changes.
 * What that must NOT do is undo what the user did on the stage — the block
 * they dragged into a corner and pulled wider has to stay there when they
 * change its colour. These pin that contract against the real store.
 */
const load = () =>
  useCompositorStore.getState().load({
    id: "doc-1",
    aspect: "1:1",
    background: { kind: "image", src: "http://x/bg.jpg" },
    layers: [],
  });
const words = () =>
  useCompositorStore
    .getState()
    .doc?.layers.find((l) => l.id === WORDS_LAYER_ID);

describe("syncAdWords", () => {
  beforeEach(() => useCompositorStore.getState().reset());

  it("refuses with no doc — type needs something to sit on", () => {
    expect(syncAdWords("Hello", DEFAULT_TREATMENT)).toBe("no-doc");
  });

  it("places on first text, then updates in place", () => {
    load();
    expect(syncAdWords("Hello", DEFAULT_TREATMENT)).toBe("placed");
    expect(syncAdWords("Hello there", DEFAULT_TREATMENT)).toBe("updated");
    expect(useCompositorStore.getState().doc?.layers).toHaveLength(1);
    expect(currentAdWords()).toBe("Hello there");
  });

  it("keeps where the user dragged it and how far they pulled it", () => {
    load();
    syncAdWords("Sale", DEFAULT_TREATMENT);
    const s = useCompositorStore.getState();
    s.patchLayout(WORDS_LAYER_ID, {
      pos: { mode: "fraction", nx: 0.2, ny: 0.1 },
      scale: 1.7,
    });

    syncAdWords("Sale", {
      ...DEFAULT_TREATMENT,
      color: "#ff0000",
      font: "Inter",
    });
    const l = words();
    expect(l?.kind).toBe("text");
    if (l?.kind !== "text") return;
    expect(l.color).toBe("#ff0000");
    expect(l.pos).toEqual({ mode: "fraction", nx: 0.2, ny: 0.1 });
    expect(l.scale).toBe(1.7);
  });

  it("re-sizes as the headline grows, so it can't keep four letters' size", () => {
    load();
    syncAdWords("Sale", DEFAULT_TREATMENT);
    const before = words();
    syncAdWords("Summer sale now on across the store", DEFAULT_TREATMENT);
    const after = words();
    if (before?.kind !== "text" || after?.kind !== "text") throw new Error();
    expect(after.sizePx).toBeLessThan(before.sizePx);
  });

  it("clears the panel when it's unticked, not just when it's ticked", () => {
    load();
    syncAdWords("Hi", { ...DEFAULT_TREATMENT, scrim: true });
    let l = words();
    expect(l?.kind === "text" && l.bg).toBeTruthy();
    syncAdWords("Hi", { ...DEFAULT_TREATMENT, scrim: false });
    l = words();
    expect(l?.kind === "text" && l.bg).toBeFalsy();
  });

  it("removes the layer when the text is cleared", () => {
    load();
    syncAdWords("Hi", DEFAULT_TREATMENT);
    expect(syncAdWords("   ", DEFAULT_TREATMENT)).toBe("removed");
    expect(words()).toBeUndefined();
    expect(syncAdWords("", DEFAULT_TREATMENT)).toBe("empty");
  });
});
