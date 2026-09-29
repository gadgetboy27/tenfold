import { describe, expect, it } from "vitest";
import { fitTextToBox, fitTextToHeight } from "@/lib/composition/text-fit";

// Monospace stub: 10px per char, 20px per line, at scale 1.
const measure = (text: string) => {
  const lines = text.split("\n");
  return {
    width: Math.max(...lines.map((l) => l.length)) * 10,
    height: lines.length * 20,
  };
};
const RAW = "fresh hot sauce made in small batches";

describe("fitTextToBox", () => {
  it("keeps one line in a wide, short box", () => {
    const fit = fitTextToBox(RAW, 1000, 40, measure);
    expect(fit.text).not.toContain("\n");
  });

  it("folds onto more lines as the box narrows", () => {
    const wide = fitTextToBox(RAW, 400, 400, measure);
    const narrow = fitTextToBox(RAW, 80, 400, measure);
    expect(narrow.text.split("\n").length).toBeGreaterThan(
      wide.text.split("\n").length,
    );
  });

  it("never overflows the box in either dimension", () => {
    for (const [w, h] of [
      [120, 300],
      [300, 60],
      [50, 50],
    ]) {
      const fit = fitTextToBox(RAW, w, h, measure);
      const m = measure(fit.text);
      expect(m.width * fit.scale).toBeLessThanOrEqual(w + 0.001);
      expect(m.height * fit.scale).toBeLessThanOrEqual(h + 0.001);
    }
  });

  it("keeps wrapChars inside the schema bounds", () => {
    const fit = fitTextToBox("hi", 10, 10, measure);
    expect(fit.wrapChars).toBeGreaterThanOrEqual(4);
    expect(fit.wrapChars).toBeLessThanOrEqual(200);
  });
});

describe("fitTextToHeight", () => {
  it("adds lines as the box gets taller, without rescaling", () => {
    const short = fitTextToHeight(RAW, 40, 1, measure);
    const tall = fitTextToHeight(RAW, 140, 1, measure);
    expect(tall.text.split("\n").length).toBeGreaterThan(
      short.text.split("\n").length,
    );
  });
});
