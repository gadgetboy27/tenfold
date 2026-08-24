import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Callers used to pass the campaign's AUTO-GENERATED project name as
 * `businessName` ("Bright Canvas"), and the model duly wrote it into the copy
 * as the customer's brand: "Bright Canvas hot sauce is small-batch for a
 * reason". That caption auto-populates the Publish box, so a fabricated brand
 * name sat one click from a real social account.
 *
 * These pin the two halves of the fix: an absent name must produce an explicit
 * "do not invent one" instruction, and a real one must still be used.
 */

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
vi.mock("@/lib/claude/caption-models", () => ({
  getCaptionModel: () => ({
    id: "test-model",
    inputCostPerM: 1,
    outputCostPerM: 1,
  }),
}));

function lastUserPrompt(): string {
  const call = create.mock.calls.at(-1)?.[0] as {
    messages: { content: string }[];
  };
  return call.messages[0].content;
}

describe("generateScript — brand name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({
      content: [{ type: "text", text: "a caption" }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  });

  it("forbids inventing a brand when none is supplied", async () => {
    const { generateScript } = await import("@/lib/claude/script");
    await generateScript({
      imageDescription: "three hot sauce bottles",
      platform: "instagram",
      tone: "professional",
      maxWords: 50,
    });

    const prompt = lastUserPrompt();
    expect(prompt).toMatch(/never invent, guess, or imply a business name/i);
    expect(prompt).not.toMatch(/^Business:/m);
  });

  it("treats an empty or whitespace name as absent", async () => {
    const { generateScript } = await import("@/lib/claude/script");
    // `/api/jobs` defaulted this to "" for years — that must not read as a
    // brand literally called empty string.
    await generateScript({
      imageDescription: "x",
      businessName: "   ",
      platform: "instagram",
      tone: "professional",
      maxWords: 50,
    });

    expect(lastUserPrompt()).toMatch(/never invent, guess, or imply/i);
  });

  it("uses a real brand name when the workspace has set one", async () => {
    const { generateScript } = await import("@/lib/claude/script");
    await generateScript({
      imageDescription: "x",
      businessName: "Bay Roasters",
      platform: "instagram",
      tone: "professional",
      maxWords: 50,
    });

    const prompt = lastUserPrompt();
    expect(prompt).toContain("Business: Bay Roasters");
    expect(prompt).not.toMatch(/never invent, guess, or imply/i);
  });
});
