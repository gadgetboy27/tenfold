import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalMediaUrl } from "@/lib/social/media-url";
import { resolvePrivacy } from "@/lib/social/direct/tiktok";

/**
 * TikTok's three failure modes that don't look like failures, plus the one
 * rule we deliberately bend for it.
 */

const REF = "https://gbccfqpmoteicpumhkuj.supabase.co";
const CUSTOM = "https://auth.prettymuch.nz";
const OBJECT = "/storage/v1/object/public/assets/ws/camp/clip.mp4";

describe("media URL is re-pointed at the verifiable host", () => {
  // Scoped to this one key — clobbering process.env wholesale breaks suites
  // running concurrently, which cost a long time to track down once already.
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = CUSTOM;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("moves a legacy supabase.co asset onto the custom domain", () => {
    // TikTok can only verify a domain we own; *.supabase.co can never be it.
    expect(canonicalMediaUrl(REF + OBJECT)).toBe(CUSTOM + OBJECT);
  });

  it("leaves a URL already on the canonical host untouched", () => {
    expect(canonicalMediaUrl(CUSTOM + OBJECT)).toBe(CUSTOM + OBJECT);
  });

  it("is idempotent", () => {
    const once = canonicalMediaUrl(REF + OBJECT);
    expect(canonicalMediaUrl(once)).toBe(once);
  });

  it("preserves the full object path and query", () => {
    const q = OBJECT + "?download=1";
    expect(canonicalMediaUrl(REF + q)).toBe(CUSTOM + q);
  });

  it("refuses to touch a non-Storage URL", () => {
    // Re-pointing an arbitrary host would silently change what gets posted.
    const foreign = "https://example.com/video.mp4";
    expect(canonicalMediaUrl(foreign)).toBe(foreign);
  });

  it("refuses to touch a SIGNED storage URL", () => {
    // A signature is bound to the host that issued it; moving it breaks it.
    const signed = REF + "/storage/v1/object/sign/assets/x.mp4?token=abc";
    expect(canonicalMediaUrl(signed)).toBe(signed);
  });

  it("returns garbage unchanged rather than throwing", () => {
    expect(canonicalMediaUrl("not a url")).toBe("not a url");
  });

  it("is a no-op when the env var is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(canonicalMediaUrl(REF + OBJECT)).toBe(REF + OBJECT);
  });
});

describe("privacy never exceeds what the account allows", () => {
  const info = (opts: string[]) => ({
    nickname: null,
    privacyOptions: opts as never,
    maxDurationSec: null,
  });

  it("downgrades PUBLIC to SELF_ONLY on an unaudited app", () => {
    // The single most likely mistake: an unaudited app may only post
    // SELF_ONLY, and asking for PUBLIC is rejected outright.
    expect(resolvePrivacy("PUBLIC_TO_EVERYONE", info(["SELF_ONLY"]))).toBe(
      "SELF_ONLY",
    );
  });

  it("honours PUBLIC once the account actually offers it", () => {
    expect(
      resolvePrivacy(
        "PUBLIC_TO_EVERYONE",
        info(["PUBLIC_TO_EVERYONE", "SELF_ONLY"]),
      ),
    ).toBe("PUBLIC_TO_EVERYONE");
  });

  it("defaults to SELF_ONLY when nothing was requested", () => {
    expect(resolvePrivacy(undefined, info(["PUBLIC_TO_EVERYONE"]))).toBe(
      "PUBLIC_TO_EVERYONE",
    );
  });

  it("falls back to the conservative default when creator_info fails", () => {
    // A creator_info outage must not block posting — it posts privately.
    expect(resolvePrivacy(undefined, null)).toBe("SELF_ONLY");
  });
});

describe("the publish route's TikTok carve-out", () => {
  const src = readFileSync("app/api/publish/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("sends TikTok the 9:16 render even when a file is picked", () => {
    expect(src).toContain("tiktokVertical");
    expect(src).toMatch(/platform === "tiktok" && tiktokVertical/);
  });

  it("falls back to the picked file when no vertical render exists", () => {
    // An addition, never a refusal: no 9:16 must still post something.
    expect(src).toMatch(/tiktokVertical\s*\n?\s*\?\s*tiktokVertical/);
    expect(src).toContain("pickForPlatform(platform, assetsByAspect");
  });

  it("lets the per-platform music mute win over the vertical swap", () => {
    // The 9:16 renders are branded exports with the bed burnt in. Swapping one
    // into a noMusic publish would deliver the exact audio the user muted.
    expect(src).toMatch(/includes\("tiktok"\)\s*\|\|\s*body\.noMusic/);
  });

  it("does NOT extend the substitution to the other 9:16 platforms", () => {
    // instagram, snapchat and pinterest are also 9:16. Widening the carve-out
    // to them was never asked for and erodes the one-file rule further.
    for (const p of ["instagram", "snapchat", "pinterest"]) {
      expect(src).not.toMatch(
        new RegExp(`platform === "${p}" && \\w*[Vv]ertical`),
      );
    }
  });
});

describe("the adapter guards TikTok's quiet failures", () => {
  const src = readFileSync("lib/social/direct/tiktok.ts", "utf8");

  it("queries creator_info before posting", () => {
    expect(src).toContain("creator_info/query");
  });

  it("canonicalises the media URL before handing it over", () => {
    expect(src).toContain("canonicalMediaUrl(params.mediaUrl)");
  });

  it("waits for a rejection before reporting success", () => {
    const idx = readFileSync("lib/social/direct/index.ts", "utf8");
    expect(idx).toContain("awaitTikTokAcceptance");
  });
});
