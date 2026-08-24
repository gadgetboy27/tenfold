import { describe, it, expect } from "vitest";
import {
  promptNeedsLegibleText,
  resolveImageModel,
} from "@/lib/fal/text-in-image";

/**
 * FLUX is the default and cannot spell: a hot-sauce brief that never asked for
 * text came back with bottles labelled "AUNCEAAN FLEANCE". For a tool selling
 * publishable brand assets that output is worthless, and nothing told the user
 * which knob to turn.
 */

describe("promptNeedsLegibleText", () => {
  it("catches packaged goods, which carry a label whether or not you ask", () => {
    // The actual failing brief. No mention of text anywhere in it.
    expect(
      promptNeedsLegibleText(
        "Small-batch hot sauce brand, three bottles on weathered timber, chilli and lime scattered around, warm afternoon light",
      ),
    ).toBe(true);
  });

  it("catches an explicitly quoted phrase", () => {
    expect(promptNeedsLegibleText('a mug that says "Monday again"')).toBe(true);
    // Curly quotes too — what you get pasting from a doc.
    expect(promptNeedsLegibleText("a poster reading “Open Late”")).toBe(true);
  });

  it.each([
    "a neon sign above a bar",
    "storefront on a rainy street",
    "menu board in a cafe",
    "business card on marble",
    "product shot of a serum",
  ])("catches %s", (p) => {
    expect(promptNeedsLegibleText(p)).toBe(true);
  });

  it("leaves plain photography alone", () => {
    // Routing these away from FLUX would trade a better photographic model for
    // nothing — the switch must be the exception, not the rule.
    expect(
      promptNeedsLegibleText("a golden retriever running through long grass"),
    ).toBe(false);
    expect(promptNeedsLegibleText("misty mountains at sunrise")).toBe(false);
    expect(promptNeedsLegibleText("close-up of hands kneading dough")).toBe(
      false,
    );
  });
});

describe("resolveImageModel", () => {
  const textPrompt = "three hot sauce bottles on timber";
  const plainPrompt = "misty mountains at sunrise";

  it("never overrides an explicit choice", () => {
    // Silently switching under someone who deliberately picked a model is worse
    // than the garbled text — it overrides an instruction.
    const r = resolveImageModel({
      requested: "flux-pro",
      prompt: textPrompt,
      isPro: true,
    });
    expect(r.model.id).toBe("flux-pro");
    expect(r.switchedForText).toBe(false);
  });

  it("keeps the default for briefs with no lettering", () => {
    const r = resolveImageModel({ prompt: plainPrompt, isPro: true });
    expect(r.model.id).toBe("flux-pro");
    expect(r.switchedForText).toBe(false);
  });

  it("routes Pro users to Typeset", () => {
    const r = resolveImageModel({ prompt: textPrompt, isPro: true });
    expect(r.model.id).toBe("ideogram");
    expect(r.switchedForText).toBe(true);
  });

  it("routes free users to a model they can actually use, at the same price", () => {
    const r = resolveImageModel({ prompt: textPrompt, isPro: false });

    expect(r.model.id).toBe("nano-banana");
    expect(r.switchedForText).toBe(true);
    // The two properties that make this safe to do automatically: no upgrade
    // wall, and no surprise on the invoice.
    expect(r.model.proOnly).toBe(false);
    expect(r.model.creditCost).toBe(12);
  });

  it("never hands a free user a Pro model", () => {
    const r = resolveImageModel({ prompt: textPrompt, isPro: false });
    expect(r.model.proOnly).toBe(false);
  });
});
