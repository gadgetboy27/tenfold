import { describe, expect, it } from "vitest";
import { sourcesRenderable, isInlineRaster } from "@/lib/composition/sources";
import { docSignature } from "@/lib/composition/signature";
import type { CompositionDoc, Layer } from "@/lib/composition/layers";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("which sources the renderer accepts", () => {
  it("accepts http(s) layers", () => {
    expect(sourcesRenderable("https://x/bg.mp4", ["https://x/logo.png"])).toBe(
      true,
    );
  });

  it("accepts a sticker's inline picture — the bug behind 'must be uploaded'", () => {
    expect(
      sourcesRenderable("https://x/bg.mp4", ["https://x/logo.png", PNG]),
    ).toBe(true);
  });

  it("still refuses a blob: URL, which only exists in the browser tab", () => {
    expect(
      sourcesRenderable("https://x/bg.mp4", ["blob:https://app/abc"]),
    ).toBe(false);
  });

  it("refuses inline data that isn't a raster picture", () => {
    expect(isInlineRaster("data:text/html;base64,PGgxPg==")).toBe(false);
    expect(isInlineRaster("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
  });

  it("refuses an oversized inline picture", () => {
    const big = "data:image/png;base64," + "A".repeat(17 * 1024 * 1024);
    expect(isInlineRaster(big)).toBe(false);
  });

  it("the backdrop and music must still be real URLs, never inline", () => {
    expect(sourcesRenderable(PNG, [])).toBe(false);
    expect(sourcesRenderable("https://x/bg.mp4", [], PNG)).toBe(false);
  });
});

describe("docSignature", () => {
  const layer = (over: Record<string, unknown> = {}): Layer =>
    ({
      id: "a",
      kind: "text",
      text: "Sale",
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
      ...over,
    }) as Layer;
  const doc = (layers: Layer[]): CompositionDoc => ({
    id: "d",
    aspect: "1:1",
    background: { kind: "video", src: "https://x/v.mp4" },
    layers,
  });

  it("is stable for the same doc", () => {
    expect(docSignature(doc([layer()]))).toBe(docSignature(doc([layer()])));
  });

  it("does not care about key order — jsonb reorders keys on a round trip", () => {
    const a = layer();
    const b = JSON.parse(
      JSON.stringify(Object.fromEntries(Object.entries(a).reverse())),
    ) as Layer;
    expect(docSignature(doc([a]))).toBe(docSignature(doc([b])));
  });

  it("changes when anything visible changes", () => {
    const base = docSignature(doc([layer()]));
    expect(docSignature(doc([layer({ text: "Sale!" })]))).not.toBe(base);
    expect(
      docSignature(
        doc([layer({ pos: { mode: "fraction", nx: 0.4, ny: 0.5 } })]),
      ),
    ).not.toBe(base);
    expect(docSignature({ ...doc([layer()]), aspect: "9:16" })).not.toBe(base);
  });

  it("ignores widths measured at export time", () => {
    const plain = layer({
      reveal: {
        mode: "karaoke",
        delaySec: 0,
        durationSec: 3,
        holdSec: 0,
        end: "none",
      },
    });
    const stamped = layer({
      reveal: {
        mode: "karaoke",
        delaySec: 0,
        durationSec: 3,
        holdSec: 0,
        end: "none",
        lineWidths: [300],
      },
    });
    expect(docSignature(doc([plain]))).toBe(docSignature(doc([stamped])));
  });
});
