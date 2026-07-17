import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { backendFor } from "@/lib/social/publish-dispatch";

/**
 * P5 — the publish dispatcher seam.
 *
 * The route used to fork on platform name (`if facebook / else if instagram /
 * else ayrshare`), which meant every direct integration was another branch and
 * nothing recorded which backend handled a platform. The seam makes the backend
 * choice data. No behaviour change: Meta still handles FB/IG when connected
 * here, Ayrshare handles the rest.
 */

describe("backendFor", () => {
  it("routes Facebook and Instagram to Meta when connected directly", () => {
    expect(backendFor("facebook", true)).toBe("meta");
    expect(backendFor("instagram", true)).toBe("meta");
  });

  it("falls back to Ayrshare when the account isn't connected via Meta", () => {
    // A workspace that linked Facebook through Ayrshare instead has no Meta
    // profile row, so it must route to Ayrshare — not fail because "facebook
    // means Meta".
    expect(backendFor("facebook", false)).toBe("ayrshare");
    expect(backendFor("instagram", false)).toBe("ayrshare");
  });

  it("routes every other platform to Ayrshare", () => {
    for (const p of ["tiktok", "linkedin", "reddit", "youtube", "pinterest"]) {
      expect(backendFor(p, true)).toBe("ayrshare");
      expect(backendFor(p, false)).toBe("ayrshare");
    }
  });
});

describe("the route wires the seam and logs attempts", () => {
  const route = readFileSync("app/api/publish/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  it("chooses the backend through backendFor, not a hardcoded fork", () => {
    expect(route).toContain("backendFor(");
    // The old fork keyed the whole decision on the platform string literal.
    expect(route).not.toMatch(/if \(platform === "facebook" && meta\)/);
  });

  it("records an attempt for every outcome, success or failure", () => {
    expect(route).toContain("publish_attempts");
    // Logged on total failure too — the case that used to return 500 and vanish.
    expect(route).toMatch(/logAttempts\(null\)/);
  });

  it("still derives the response shapes the client depends on", () => {
    // platformResults + errors must survive the refactor unchanged, or the UI
    // and publish_records break.
    expect(route).toContain("platformResults[o.platform]");
    expect(route).toContain("errors[o.platform]");
  });

  it("keeps logging best-effort so it can't fail a real publish", () => {
    // A logging hiccup must never turn a post that went out into a 500.
    expect(route).toMatch(/attempt log failed/);
  });
});
