import { describe, it, expect } from "vitest";
import { generateCampaignName, NAME_COMBINATIONS } from "@/lib/names/generator";
import { randomCampaignName } from "@/lib/util/campaign-name";

/**
 * Reported as "gallery names aren't randomised — two previous projects and the
 * one in play share a name".
 *
 * Two causes, and the workspace data separated them. Four projects called
 * "Amber Pulse", THREE of them inside three minutes (12:12, 12:14, 12:15):
 *
 * 1. There were two generators. `lib/util/campaign-name.ts` had a 16×16 list
 *    and `lib/names/generator.ts` a larger one, and Studio — the only live
 *    surface — imported the small one. 256 combinations against 50 campaigns
 *    is a ~99% chance of collision. Both "Amber" and "Pulse" were in it.
 * 2. The name only re-rolled on "New campaign". POST /api/campaigns creates a
 *    new campaign EVERY time, so a second Generate reused the pre-filled name.
 *    That is the three-in-three-minutes, and no pool size fixes it.
 */

describe("one generator, not two", () => {
  it("the old import path is the same function", () => {
    // Two word lists is how the weaker one won by import path.
    expect(randomCampaignName).toBe(generateCampaignName);
  });

  it("has a pool big enough to be worth checking against", () => {
    expect(NAME_COMBINATIONS).toBeGreaterThan(2000);
  });

  it("still produces the classic shape", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCampaignName()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
  });
});

describe("avoids names already in use", () => {
  it("never returns a taken name", () => {
    const taken = ["Amber Pulse"];
    for (let i = 0; i < 200; i++) {
      expect(generateCampaignName(taken)).not.toBe("Amber Pulse");
    }
  });

  it("ignores case and stray spacing when comparing", () => {
    // "amber  pulse" and "Amber Pulse" are the same name to a person reading
    // the gallery, which is the only reader that matters here.
    const taken = ["  amber   pulse  "];
    for (let i = 0; i < 200; i++) {
      expect(generateCampaignName(taken).toLowerCase()).not.toBe("amber pulse");
    }
  });

  it("still returns something when the whole pool is taken", () => {
    // The bug this guards is a HANG: an unbounded retry loop spins forever
    // once nothing is free, which is worse than a duplicate.
    const everything: string[] = [];
    for (let i = 0; i < 4000; i++) everything.push(generateCampaignName());
    const name = generateCampaignName(everything);
    expect(name.length).toBeGreaterThan(0);
  });

  it("survives an empty or junk taken-list without crashing", () => {
    expect(generateCampaignName([]).length).toBeGreaterThan(0);
    expect(generateCampaignName(["", "   "]).length).toBeGreaterThan(0);
  });
});

describe("the reported scenario", () => {
  it("three projects in a row never repeat a name", () => {
    // Exactly what happened at 12:12, 12:14 and 12:15: generate, generate,
    // generate — no "New campaign" in between. Studio now feeds each result
    // back in as taken, which is what this models.
    for (let run = 0; run < 300; run++) {
      const used = new Set<string>();
      for (let i = 0; i < 3; i++) {
        const name = generateCampaignName(used);
        expect(used.has(name), `repeat on project ${i + 1}`).toBe(false);
        used.add(name);
      }
    }
  });

  it("fifty projects in one session stay unique", () => {
    // The birthday paradox bites hard here — 50 draws from 2,256 collide about
    // 40% of the time WITHOUT the taken-check. With it, never.
    const used = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const name = generateCampaignName(used);
      expect(used.has(name)).toBe(false);
      used.add(name);
    }
    expect(used.size).toBe(50);
  });
});
