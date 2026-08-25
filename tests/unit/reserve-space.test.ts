import { describe, it, expect } from "vitest";
import {
  compositionGuidance,
  reserveSpaceInstruction,
  NO_TEXT_INSTRUCTION,
} from "@/lib/fal/reserve-space";
import { fallbackDirections } from "@/lib/fal/prompt-validator";
import { WORD_ZONES } from "@/lib/composition/words";

/**
 * Saying "leave room here" BEFORE generating is strictly better than stamping
 * type on afterwards: the model composes around the gap, so the headline lands
 * on clean space instead of a focal point that then needs a scrim to rescue it.
 *
 * The letters still never reach the model. It is told WHERE to leave room and
 * told to render no text — which also suppresses the lettering it invents
 * unprompted ("AUNCEAAN FLEANCE" came from a brief that never mentioned text).
 */

describe("the model is told where, never what", () => {
  it("never includes the wording in the guidance", () => {
    // reserveSpaceInstruction takes a zone and nothing else — there is no
    // parameter through which letters could reach the prompt. This asserts the
    // shape stays that way.
    const guidance = reserveSpaceInstruction("bottom");
    expect(guidance).toBeTruthy();
    expect(reserveSpaceInstruction.length).toBe(1); // arity: zone only
  });

  it("suppresses text even when no space is reserved", () => {
    // Image models add invented signage and watermarks to product scenes
    // unasked, and it is always wrong — so this is unconditional.
    expect(compositionGuidance(null)).toBe(NO_TEXT_INSTRUCTION);
    expect(compositionGuidance(null)).toMatch(/no text/i);
  });

  it("describes every zone in plain language a model can act on", () => {
    for (const z of WORD_ZONES) {
      const g = reserveSpaceInstruction(z.id);
      expect(g).toBeTruthy();
      // Must name a region AND still forbid text.
      expect(g!).toMatch(/quiet|low detail|simple background/i);
      expect(g!).toMatch(/no text/i);
    }
  });

  it("asks for quiet space rather than empty space", () => {
    // "Leave it blank" produces dead compositions; "keep it visually quiet"
    // gets usable negative space with the subject still doing something.
    const g = reserveSpaceInstruction("bottom")!;
    expect(g).toMatch(/visually quiet/i);
    expect(g).toMatch(/text will be overlaid/i);
  });
});

describe("the fallback path carries the same guidance", () => {
  it("applies it when Claude is unavailable", () => {
    // fallbackDirections runs whenever the validator can't reach Claude or gets
    // nothing usable back. A direction that forgets the guidance silently
    // reintroduces invented lettering and leaves no room for the overlay.
    const dirs = fallbackDirections("a coffee roastery", 4, "bottom");
    expect(dirs).toHaveLength(4);
    for (const d of dirs) {
      expect(d.prompt).toMatch(/no text/i);
      expect(d.prompt).toMatch(/lower third/i);
    }
  });

  it("still suppresses text when nothing is reserved", () => {
    const dirs = fallbackDirections("a coffee roastery", 2, null);
    for (const d of dirs) expect(d.prompt).toMatch(/no text/i);
  });

  it("keeps the user's own prompt intact", () => {
    // Guidance is appended, never woven in — the same boundary the Words tool
    // draws around wording the user supplied.
    const dirs = fallbackDirections("a coffee roastery at dawn", 1, "top");
    expect(dirs[0].prompt.startsWith("a coffee roastery at dawn")).toBe(true);
  });
});
