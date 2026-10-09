import { describe, it, expect } from "vitest";
import {
  isRenderScale,
  needsHdPlan,
  outputSize,
  sizeLabel,
} from "@/lib/composition/quality";

describe("render scales", () => {
  it("only Standard and High exist — the unused, nine-times-the-pixels third level is gone", () => {
    expect(isRenderScale(1)).toBe(true);
    expect(isRenderScale(2)).toBe(true);
    for (const bad of [0, 1.5, 3, 4, -1, NaN, "2", null, undefined])
      expect(isRenderScale(bad)).toBe(false);
  });

  it("anything above Standard is a plan feature", () => {
    expect(needsHdPlan(1)).toBe(false);
    expect(needsHdPlan(2)).toBe(true);
  });
});

describe("output size", () => {
  it.each([
    ["9:16", 1, 1080, 1920],
    ["9:16", 2, 2160, 3840],
    ["1:1", 1, 1080, 1080],
    ["1:1", 2, 2160, 2160],
    ["16:9", 1, 1920, 1080],
    ["16:9", 2, 3840, 2160],
  ] as const)("%s at %i× is %i×%i", (aspect, scale, w, h) => {
    expect(outputSize(aspect, scale)).toEqual({ width: w, height: h });
  });

  it("labels the real pixel size, so 'High' is a number the user can check", () => {
    expect(sizeLabel("9:16", 2)).toBe("2160×3840");
    expect(sizeLabel("16:9", 1)).toBe("1920×1080");
  });
});
