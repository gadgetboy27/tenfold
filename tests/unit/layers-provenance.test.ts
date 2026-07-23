import { describe, it, expect } from "vitest";
import { imageLayerSchema } from "@/lib/composition/layers";

const baseImage = {
  id: "l1",
  kind: "image" as const,
  src: "https://x/img.jpg",
  pos: { mode: "fraction" as const, nx: 0.5, ny: 0.5 },
};

describe("imageLayerSchema — producedBy provenance", () => {
  it("still parses a plain image layer with no producedBy (backward compat)", () => {
    const result = imageLayerSchema.safeParse(baseImage);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.producedBy).toBeUndefined();
  });

  it("parses an image layer produced by a compositing op", () => {
    const result = imageLayerSchema.safeParse({
      ...baseImage,
      locked: true,
      producedBy: {
        op: "cutout",
        jobId: "job-1",
        params: { imageUrl: "https://x/source.jpg" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.producedBy?.op).toBe("cutout");
      expect(result.data.locked).toBe(true);
    }
  });

  it("rejects an unrecognized op", () => {
    const result = imageLayerSchema.safeParse({
      ...baseImage,
      producedBy: { op: "not-a-real-op", params: {} },
    });
    expect(result.success).toBe(false);
  });

  it("accepts producedBy without params or jobId (both optional)", () => {
    const result = imageLayerSchema.safeParse({
      ...baseImage,
      producedBy: { op: "relight" },
    });
    expect(result.success).toBe(true);
  });
});
