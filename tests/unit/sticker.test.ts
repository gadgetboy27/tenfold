import { describe, it, expect, vi, beforeEach } from "vitest";
import { layerSchema } from "@/lib/composition/layers";
import {
  DEFAULT_STICKER,
  STICKER_FONTS,
  stickerPadding,
  stickerSpecSchema,
  stickerWeight,
} from "@/lib/composition/sticker";
import { dataUrlBytes } from "@/lib/composition/export";

/**
 * A sticker is rasterised text living on the ad as an image layer, so that
 * tilt / flip / glow / neon reach the export — which draws text with
 * drawtext and can do none of those — as ordinary pixels.
 */
describe("sticker spec", () => {
  it("is an image layer carrying its spec, and the doc schema accepts it", () => {
    const layer = {
      id: "s1",
      kind: "image",
      src: "data:image/png;base64,iVBORw0KGgo=",
      sticker: DEFAULT_STICKER,
      pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
      scale: 0.4,
      rotationDeg: -12,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    };
    const parsed = layerSchema.safeParse(layer);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === "image") {
      expect(parsed.data.sticker?.effect).toBe("neon");
    }
  });

  it("only offers faces we have a file for, display faces first", () => {
    expect(STICKER_FONTS[0]).toBe("Anton");
    expect(
      stickerSpecSchema.safeParse({ ...DEFAULT_STICKER, font: "Comic Sans" })
        .success,
    ).toBe(false);
  });

  it("a single-cut display face can't be asked for a weight it doesn't have", () => {
    expect(stickerWeight({ font: "Bebas Neue", weight: 700 })).toBe(400);
    expect(stickerWeight({ font: "Inter", weight: 700 })).toBe(700);
  });

  it("pads the raster for the effect's reach so a glow isn't clipped", () => {
    expect(stickerPadding("none", 200)).toBeLessThan(
      stickerPadding("shadow", 200),
    );
    expect(stickerPadding("shadow", 200)).toBeLessThan(
      stickerPadding("glow", 200),
    );
    expect(stickerPadding("glow", 200)).toBeLessThan(
      stickerPadding("neon", 200),
    );
  });
});

describe("export reads a sticker's data: URL", () => {
  it("decodes base64 PNG bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const url = `data:image/png;base64,${png.toString("base64")}`;
    expect(dataUrlBytes(url)).toEqual(png);
  });
  it("leaves real URLs to fetch", () => {
    expect(dataUrlBytes("https://x/y.png")).toBeNull();
  });
});

// The bridge, with the canvas rasteriser stubbed — Node has no 2D context.
vi.mock("@/lib/composition/sticker", async (orig) => ({
  ...(await orig<typeof import("@/lib/composition/sticker")>()),
  rasterizeSticker: vi.fn((spec: { text: string }) => ({
    dataUrl: `data:image/png;base64,${Buffer.from(spec.text).toString("base64")}`,
    width: 100 * spec.text.length,
    height: 260,
  })),
}));

describe("stickers on the ad", () => {
  beforeEach(async () => {
    const { useCompositorStore } = await import("@/store/useCompositorStore");
    useCompositorStore.getState().reset();
  });

  it("lands as a selected image layer sized to the frame, and restyles in place", async () => {
    const { useCompositorStore } = await import("@/store/useCompositorStore");
    const { addStickerToAd, restyleSticker, pickStickerTarget } =
      await import("@/components/studio/adBridge");
    expect(addStickerToAd(DEFAULT_STICKER)).toBeNull(); // no ad yet

    useCompositorStore.getState().load({
      id: "d",
      aspect: "1:1",
      background: { kind: "image", src: "http://x/bg.jpg" },
      layers: [],
    });
    const id = addStickerToAd(DEFAULT_STICKER)!;
    const s = useCompositorStore.getState();
    const layer = s.doc!.layers.find((l) => l.id === id)!;
    expect(layer.kind).toBe("image");
    if (layer.kind !== "image") return;
    expect(layer.sticker).toEqual(DEFAULT_STICKER);
    // 400px wide raster → ~40% of a 1080 frame → scale just over 1, capped.
    expect(layer.scale).toBeLessThanOrEqual(1);
    expect(s.selectedLayerId).toBe(id);
    expect(pickStickerTarget(s.doc!.layers, id)?.id).toBe(id);

    // Tilt it, then retype: the tilt survives, the pixels change.
    s.patchLayout(id, { rotationDeg: -12 });
    expect(restyleSticker(id, { ...DEFAULT_STICKER, text: "50% OFF" })).toBe(
      true,
    );
    const after = useCompositorStore
      .getState()
      .doc!.layers.find((l) => l.id === id)!;
    if (after.kind !== "image") throw new Error();
    expect(after.rotationDeg).toBe(-12);
    expect(after.sticker?.text).toBe("50% OFF");
    expect(after.src).not.toBe(layer.src);
  });

  it("won't restyle an image that isn't a sticker", async () => {
    const { useCompositorStore } = await import("@/store/useCompositorStore");
    const { restyleSticker, pickStickerTarget } =
      await import("@/components/studio/adBridge");
    useCompositorStore.getState().load({
      id: "d",
      aspect: "1:1",
      background: { kind: "image", src: "http://x/bg.jpg" },
      layers: [
        {
          id: "logo",
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
        },
      ],
    });
    expect(restyleSticker("logo", DEFAULT_STICKER)).toBe(false);
    expect(
      pickStickerTarget(useCompositorStore.getState().doc!.layers, "logo"),
    ).toBeNull();
  });
});
