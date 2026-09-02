import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  isPlatformConfigured,
  configuredPlatforms,
  CONNECTABLE_PLATFORMS,
} from "@/lib/social/configured";
import { readProfilesResponse } from "@/lib/social/profiles-response";

/**
 * The settings page advertised "3/3 ready" beside TikTok while its connect
 * route answered 503 "isn't configured on this deployment yet" — the badge
 * counted checkboxes the user had ticked in their own browser, which verify
 * nothing. These pin the badge to the same fact the 503 is decided from.
 */

const KEYS = [
  "META_APP_ID",
  "LINKEDIN_CLIENT_ID",
  "REDDIT_CLIENT_ID",
  "PINTEREST_APP_ID",
  "TIKTOK_CLIENT_KEY",
  "YOUTUBE_CLIENT_ID",
] as const;

describe("what counts as configured", () => {
  // Scoped save/restore. Replacing process.env wholesale breaks suites running
  // concurrently — that cost a long time to find once already.
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("says TikTok is NOT ready with no client key", () => {
    expect(isPlatformConfigured("tiktok")).toBe(false);
    expect(configuredPlatforms()).not.toContain("tiktok");
  });

  it("says TikTok IS ready once the key is present", () => {
    process.env.TIKTOK_CLIENT_KEY = "awxxxxxxxxxxxxxx";
    expect(isPlatformConfigured("tiktok")).toBe(true);
    expect(configuredPlatforms()).toContain("tiktok");
  });

  it("treats Bluesky as always ready — it needs no developer app at all", () => {
    // The one platform with no env var, no review and no portal.
    expect(isPlatformConfigured("bluesky")).toBe(true);
  });

  it("covers Facebook and Instagram with the one Meta app", () => {
    expect(isPlatformConfigured("facebook")).toBe(false);
    process.env.META_APP_ID = "123";
    expect(isPlatformConfigured("facebook")).toBe(true);
    expect(isPlatformConfigured("instagram")).toBe(true);
  });

  it("never calls an unknown platform ready", () => {
    // Claiming readiness because we failed to recognise a name is the exact
    // failure this file exists to stop.
    for (const p of ["twitter", "threads", "gmb", "telegram", "", "TIKTOK"]) {
      expect(isPlatformConfigured(p)).toBe(false);
    }
  });

  it("reports nothing but Bluesky on a bare deployment", () => {
    expect(configuredPlatforms()).toEqual(["bluesky"]);
  });
});

describe("the badge cannot drift from the 503", () => {
  const connectDir = "app/api/social/connect";
  // Directories only: `connect/route.ts` is the Ayrshare endpoint and is not
  // a per-platform route.
  const gated = readdirSync(connectDir)
    .filter((p) => statSync(`${connectDir}/${p}`).isDirectory())
    .filter((p) =>
      readFileSync(`${connectDir}/${p}/route.ts`, "utf8").includes("503"),
    );

  it("finds the gated routes at all", () => {
    expect(gated.length).toBeGreaterThan(3);
  });

  for (const p of gated) {
    it(`${p} decides its 503 from isPlatformConfigured, not its own env read`, () => {
      const src = readFileSync(`${connectDir}/${p}/route.ts`, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(src).toContain("isPlatformConfigured");
      // A second env condition is a second source of truth, and it drifts.
      expect(src).not.toMatch(/if \(!process\.env\./);
    });
  }

  it("knows about every platform the connect routes serve", () => {
    for (const p of gated) {
      expect(CONNECTABLE_PLATFORMS as readonly string[]).toContain(p);
    }
  });
});

describe("the response envelope degrades safely", () => {
  it("reads the configured list", () => {
    const r = readProfilesResponse({
      profiles: [],
      configuredPlatforms: ["tiktok", "bluesky"],
    });
    expect(r.configuredPlatforms).toEqual(["tiktok", "bluesky"]);
  });

  it("understates rather than overstates on an older route", () => {
    // An open tab outlives a deploy. Empty means "nothing advertised ready",
    // which is the safe direction — same choice ayrshareEnabled makes.
    expect(readProfilesResponse([]).configuredPlatforms).toEqual([]);
    expect(readProfilesResponse({ profiles: [] }).configuredPlatforms).toEqual(
      [],
    );
  });

  it("discards non-string entries rather than trusting the shape", () => {
    const r = readProfilesResponse({
      profiles: [],
      configuredPlatforms: ["tiktok", 7, null, { x: 1 }],
    });
    expect(r.configuredPlatforms).toEqual(["tiktok"]);
  });
});

describe("the page no longer counts self-attested checkboxes", () => {
  const src = readFileSync(
    "app/(dashboard)/[workspace]/settings/social/page.tsx",
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("shows real state in the pill", () => {
    expect(src).toContain('"Ready to connect"');
    expect(src).toContain('"Not set up yet"');
  });

  it("no longer renders an n/n ready count", () => {
    expect(src).not.toMatch(/\{totalChecked\}\/\{totalItems\} ready/);
    expect(src).not.toContain("totalChecked");
  });
});
