import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  addStickerToAd,
  pickStickerTarget,
  restyleSticker,
  setStickerFx,
} from "@/components/studio/adBridge";
import { defaultFx } from "@/lib/composition/fx/catalog";
import { DEFAULT_STICKER } from "@/lib/composition/sticker";

/**
 * A sticker's effect belongs to the sticker on the ad — not to the look the
 * toolbox remembers for the next one, and not to the picture, which a restyle
 * re-draws. These pin that against the real store.
 */
let n = 0;
vi.mock("@/lib/composition/sticker", async (orig) => ({
  ...(await orig<typeof import("@/lib/composition/sticker")>()),
  // The real rasteriser needs a canvas; a fresh fake picture per call lets a
  // test see whether the picture was re-drawn.
  rasterizeSticker: () => ({
    dataUrl: `data:image/png;base64,AAAA${n++}`,
    width: 400,
    height: 200,
  }),
}));

const load = () =>
  useCompositorStore.getState().load({
    id: "doc-1",
    aspect: "1:1",
    background: { kind: "image", src: "http://x/bg.jpg" },
    layers: [],
  });
const layers = () => useCompositorStore.getState().doc?.layers ?? [];
const sticker = (id: string) => pickStickerTarget(layers(), id);

describe("sticker effect", () => {
  beforeEach(() => {
    n = 0;
    useCompositorStore.getState().reset();
    load();
  });

  it("a new sticker starts with no effect — even if the look it was built from had one", () => {
    const id = addStickerToAd({
      ...DEFAULT_STICKER,
      fx: defaultFx("crumble"),
    })!;
    expect(sticker(id)?.sticker.fx).toBeUndefined();
  });

  it("sets an effect on the selected sticker and leaves the picture alone", () => {
    const id = addStickerToAd(DEFAULT_STICKER)!;
    const before = sticker(id)!.src;
    expect(setStickerFx(id, defaultFx("electric"))).toBe(true);
    expect(sticker(id)?.sticker.fx?.kind).toBe("electric");
    expect(sticker(id)?.src).toBe(before); // nothing was re-rasterised
  });

  it("changes and clears it", () => {
    const id = addStickerToAd(DEFAULT_STICKER)!;
    setStickerFx(id, defaultFx("crumble"));
    setStickerFx(id, { ...defaultFx("slice"), startPct: 77 });
    expect(sticker(id)?.sticker.fx).toMatchObject({
      kind: "slice",
      startPct: 77,
    });
    expect(setStickerFx(id, null)).toBe(true);
    expect(sticker(id)?.sticker.fx).toBeUndefined();
  });

  it("keeps the rest of the sticker when it sets or clears the effect", () => {
    const id = addStickerToAd({
      ...DEFAULT_STICKER,
      text: "HOT",
      color: "#ff0000",
    })!;
    setStickerFx(id, defaultFx("dust"));
    expect(sticker(id)?.sticker).toMatchObject({
      text: "HOT",
      color: "#ff0000",
    });
    setStickerFx(id, null);
    expect(sticker(id)?.sticker).toMatchObject({
      text: "HOT",
      color: "#ff0000",
    });
  });

  it("restyling re-draws the picture but KEEPS the effect", () => {
    const id = addStickerToAd(DEFAULT_STICKER)!;
    setStickerFx(id, defaultFx("glitch"));
    const before = sticker(id)!.src;
    expect(
      restyleSticker(id, { ...sticker(id)!.sticker, color: "#00ff00" }),
    ).toBe(true);
    expect(sticker(id)?.src).not.toBe(before); // a new picture
    expect(sticker(id)?.sticker.color).toBe("#00ff00");
    expect(sticker(id)?.sticker.fx?.kind).toBe("glitch");
  });

  it("a restyle built from a STALE spec (no effect) can't wipe an effect set since", () => {
    const id = addStickerToAd(DEFAULT_STICKER)!;
    const stale = sticker(id)!.sticker; // captured before the effect was set
    setStickerFx(id, defaultFx("shine"));
    restyleSticker(id, { ...stale, text: "NEW" });
    expect(sticker(id)?.sticker.text).toBe("NEW");
    expect(sticker(id)?.sticker.fx?.kind).toBe("shine");
  });

  it("a restyle can't plant an effect either — only setStickerFx does", () => {
    const id = addStickerToAd(DEFAULT_STICKER)!;
    restyleSticker(id, { ...sticker(id)!.sticker, fx: defaultFx("crumble") });
    expect(sticker(id)?.sticker.fx).toBeUndefined();
  });

  it("refuses an id that isn't a sticker", () => {
    expect(setStickerFx("nope", defaultFx("crumble"))).toBe(false);
    useCompositorStore.getState().addLayer({
      id: "img",
      kind: "image",
      src: "http://x/a.png",
      pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    });
    expect(setStickerFx("img", defaultFx("crumble"))).toBe(false);
  });

  it("one sticker's effect doesn't touch another's", () => {
    const a = addStickerToAd(DEFAULT_STICKER)!;
    const b = addStickerToAd({ ...DEFAULT_STICKER, text: "NEW" })!;
    setStickerFx(a, defaultFx("crumble"));
    expect(sticker(a)?.sticker.fx?.kind).toBe("crumble");
    expect(sticker(b)?.sticker.fx).toBeUndefined();
  });
});
