import { describe, it, expect, beforeEach } from "vitest";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  addCaptionToAd,
  pickTextTarget,
  restyleAdText,
  retypeAdWords,
  syncAdWords,
  WORDS_LAYER_ID,
  currentAdWords,
} from "@/components/studio/adBridge";
import { CAPTION_LAYER_ID } from "@/lib/composition/layers";
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

  it("retyping keeps the colour picked a moment ago, not the panel default", () => {
    load();
    syncAdWords("Sale", { ...DEFAULT_TREATMENT, color: "#00ff00" });
    retypeAdWords("Sale on", {
      font: "Inter",
      weight: 400,
      color: "#ffffff",
      scrim: true,
    });
    const l = words();
    expect(l?.kind === "text" && l.color).toBe("#00ff00");
    expect(currentAdWords()).toBe("Sale on");
  });
});

describe("one set of pickers for every text on the ad", () => {
  beforeEach(() => useCompositorStore.getState().reset());

  it("targets the selected text layer, else the words, else the caption", () => {
    load();
    const s = () => useCompositorStore.getState();
    expect(pickTextTarget(s().doc?.layers, null)).toBeNull();

    addCaptionToAd("A caption");
    expect(pickTextTarget(s().doc?.layers, null)?.id).toBe(CAPTION_LAYER_ID);

    syncAdWords("Headline", DEFAULT_TREATMENT);
    // addLayer selects what it adds; with nothing selected the words win.
    expect(pickTextTarget(s().doc?.layers, null)?.id).toBe(WORDS_LAYER_ID);
    expect(pickTextTarget(s().doc?.layers, CAPTION_LAYER_ID)?.id).toBe(
      CAPTION_LAYER_ID,
    );
    // An image selection is not text — fall through to the words.
    s().addLayer({
      id: "img",
      kind: "image",
      src: "http://x/logo.png",
      pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    });
    expect(pickTextTarget(s().doc?.layers, "img")?.id).toBe(WORDS_LAYER_ID);
  });

  it("restyles the caption without touching the words, and vice versa", () => {
    load();
    addCaptionToAd("A caption");
    syncAdWords("Headline", DEFAULT_TREATMENT);
    expect(
      restyleAdText(CAPTION_LAYER_ID, { color: "#123456", scrim: false }),
    ).toBe(true);
    const doc = useCompositorStore.getState().doc!;
    const cap = doc.layers.find((l) => l.id === CAPTION_LAYER_ID);
    const w = doc.layers.find((l) => l.id === WORDS_LAYER_ID);
    if (cap?.kind !== "text" || w?.kind !== "text") throw new Error();
    expect(cap.color).toBe("#123456");
    expect(cap.bg).toBeUndefined();
    expect(w.color).toBe(DEFAULT_TREATMENT.color);
    expect(w.bg).toBeTruthy();
    // Position untouched by a restyle.
    expect(cap.pos).toEqual({ mode: "fraction", nx: 0.5, ny: 0.84 });
  });

  it("refuses to restyle something that isn't text", () => {
    load();
    expect(restyleAdText("nope", { color: "#000000" })).toBe(false);
  });
});
