import { describe, it, expect } from "vitest";
import { sanitise } from "@/lib/learning/record";

describe("sanitise — keeps workings, drops work", () => {
  it("keeps counts, durations and booleans", () => {
    expect(
      sanitise({ regenerations: 3, secondsOnStep: 41.5, skippedMusic: true }),
    ).toEqual({ regenerations: 3, secondsOnStep: 41.5, skippedMusic: true });
  });

  it("keeps short single-token labels", () => {
    expect(sanitise({ section: "video", model: "flux-pro" })).toEqual({
      section: "video",
      model: "flux-pro",
    });
  });

  // The failure this file exists to prevent: someone adding `prompt` to a
  // payload because it was convenient. Prose has spaces, so it is dropped
  // outright rather than trimmed — a truncated prompt is still a prompt.
  it("drops anything that looks like authored content", () => {
    expect(
      sanitise({
        prompt: "a cosy cafe on a rainy Auckland morning",
        caption: "Come in from the rain ☕",
        businessName: "Joe's Coffee",
      }),
    ).toEqual({});
  });

  it("drops long strings even without spaces", () => {
    const url =
      "https://gbccfqpmoteicpumhkuj.supabase.co/storage/v1/object/public/assets/x.jpg";
    expect(sanitise({ assetUrl: url })).toEqual({});
  });

  it("filters arrays element-wise rather than dropping the whole array", () => {
    expect(
      sanitise({ assetAskKinds: ["logo", "product_photo", "a full sentence"] }),
    ).toEqual({ assetAskKinds: ["logo", "product_photo"] });
  });

  it("omits null and undefined instead of storing them", () => {
    expect(sanitise({ a: null, b: undefined, c: 1 })).toEqual({ c: 1 });
  });
});
