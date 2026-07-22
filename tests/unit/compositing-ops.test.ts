import { describe, it, expect } from "vitest";
import {
  buildCompositeInput,
  isValidBlendCount,
  COMPOSITE_JOB_TYPE,
} from "@/lib/compositing/ops";
import { FAL_MODELS } from "@/lib/fal/models";
import { CREDIT_COSTS } from "@/lib/credits/costs";

describe("COMPOSITE_JOB_TYPE", () => {
  it("every job type has a matching FAL_MODELS endpoint and credit cost", () => {
    for (const jobType of Object.values(COMPOSITE_JOB_TYPE)) {
      expect(FAL_MODELS).toHaveProperty(jobType);
      expect(CREDIT_COSTS).toHaveProperty(jobType);
    }
  });
});

describe("buildCompositeInput", () => {
  it("cutout — matches fal-ai/birefnet/v2's verified schema (image_url only)", () => {
    const input = buildCompositeInput({
      op: "cutout",
      params: { imageUrl: "https://x/img.jpg" },
    });
    expect(input).toEqual({
      image_url: "https://x/img.jpg",
      output_format: "png",
      refine_foreground: true,
    });
  });

  it("inpaint — matches fal-ai/flux-pro/v1/fill's verified schema", () => {
    const input = buildCompositeInput({
      op: "inpaint",
      params: {
        imageUrl: "https://x/img.jpg",
        maskUrl: "https://x/mask.png",
        prompt: "add a plant",
      },
    });
    expect(input).toEqual({
      prompt: "add a plant",
      image_url: "https://x/img.jpg",
      mask_url: "https://x/mask.png",
      output_format: "png",
    });
  });

  it("relight — omits initial_latent when no direction is given", () => {
    const input = buildCompositeInput({
      op: "relight",
      params: { imageUrl: "https://x/img.jpg", prompt: "warm sunset light" },
    });
    expect(input).toEqual({
      prompt: "warm sunset light",
      image_url: "https://x/img.jpg",
      output_format: "png",
    });
    expect(input).not.toHaveProperty("initial_latent");
  });

  it("relight — passes initial_latent through as fal's exact field name", () => {
    const input = buildCompositeInput({
      op: "relight",
      params: {
        imageUrl: "https://x/img.jpg",
        prompt: "warm sunset light",
        direction: "Left",
      },
    });
    expect(input.initial_latent).toBe("Left");
  });

  it("blend — matches fal-ai/flux-pro/kontext/max/multi's verified schema (image_urls plural)", () => {
    const input = buildCompositeInput({
      op: "blend",
      params: {
        imageUrls: ["https://x/a.jpg", "https://x/b.jpg"],
        prompt: "merge the subject onto the texture",
      },
    });
    expect(input).toEqual({
      prompt: "merge the subject onto the texture",
      image_urls: ["https://x/a.jpg", "https://x/b.jpg"],
    });
  });

  it("depth — matches fal-ai/image-preprocessors/depth-anything/v2's verified schema (image_url only)", () => {
    const input = buildCompositeInput({
      op: "depth",
      params: { imageUrl: "https://x/img.jpg" },
    });
    expect(input).toEqual({ image_url: "https://x/img.jpg" });
  });
});

describe("isValidBlendCount", () => {
  it("rejects fewer than 2 images", () => {
    expect(isValidBlendCount(1)).toBe(false);
    expect(isValidBlendCount(0)).toBe(false);
  });
  it("accepts 2 through 5 images", () => {
    for (const n of [2, 3, 4, 5]) expect(isValidBlendCount(n)).toBe(true);
  });
  it("rejects more than 5 images", () => {
    expect(isValidBlendCount(6)).toBe(false);
  });
});
