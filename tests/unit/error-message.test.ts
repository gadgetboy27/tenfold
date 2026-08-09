import { describe, it, expect } from "vitest";
import { z } from "zod";
import { errorMessage } from "@/lib/api/error-message";

describe("errorMessage", () => {
  // The exact failure a user reported: a raw Zod issue array rendered in the
  // UI, naming no field they could recognise and no way to act on it.
  it("names the field and the limit instead of dumping JSON", () => {
    const schema = z.object({
      product: z.object({
        features: z.array(z.string().max(200)).max(8),
        callToAction: z.string().max(200),
      }),
    });
    const result = schema.safeParse({
      product: {
        features: ["ok", "ok", "x".repeat(300)],
        callToAction: "y".repeat(250),
      },
    });
    expect(result.success).toBe(false);

    const msg = errorMessage(result.error);
    expect(msg).toContain("product.features[2]");
    expect(msg).toContain("product.callToAction");
    expect(msg).toContain("max 200 characters");
    // And crucially, none of the machine noise.
    expect(msg).not.toContain('"code"');
    expect(msg).not.toContain("inclusive");
    expect(msg).not.toContain("{");
  });

  it("caps the list so a wrong payload doesn't produce a wall of text", () => {
    const schema = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
    });
    const msg = errorMessage(schema.safeParse({}).error);
    expect(msg).toContain("and 2 more");
    expect(msg.split(";")).toHaveLength(3);
  });

  it("passes ordinary errors through untouched", () => {
    expect(errorMessage(new Error("Insufficient credits"))).toBe(
      "Insufficient credits",
    );
  });

  it("falls back when there is nothing usable", () => {
    expect(errorMessage(null, "Generation failed")).toBe("Generation failed");
    expect(errorMessage({}, "Nope")).toBe("Nope");
  });

  it("handles a top-level failure with no path", () => {
    const msg = errorMessage(z.string().safeParse(42).error);
    expect(msg).toContain("value");
    expect(msg).not.toContain("{");
  });
});
