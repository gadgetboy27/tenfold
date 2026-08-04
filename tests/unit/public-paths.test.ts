import { describe, it, expect } from "vitest";
import { isProtectedPath, PUBLIC_PREFIXES } from "@/lib/auth/public-paths";
import { GUIDES } from "@/lib/marketing/guides";

describe("isProtectedPath", () => {
  it("gates workspace routes", () => {
    expect(isProtectedPath("/henrypeti/settings")).toBe(true);
    expect(isProtectedPath("/my-workspace/compositor")).toBe(true);
    expect(isProtectedPath("/dashboard")).toBe(true);
  });

  it("leaves single-segment marketing pages alone", () => {
    // These never matched the workspace pattern (no second segment), but they
    // must stay public if that pattern is ever loosened.
    for (const p of ["/", "/about", "/pricing", "/terms", "/privacy"]) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });

  it("leaves auth pages public", () => {
    for (const p of [
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
    ]) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });

  // The regression this file exists for: a two-segment public path is
  // structurally identical to /{workspace}/{page}, so /guides/* was matching
  // the workspace pattern and 307ing to /login. The page prerendered and sat
  // in the sitemap while being unreachable to readers and crawlers.
  it("does not gate public sections that look like workspace routes", () => {
    expect(isProtectedPath("/guides/do-you-own-ai-generated-images")).toBe(
      false,
    );
  });

  it("keeps every published guide reachable", () => {
    for (const g of GUIDES) {
      expect(isProtectedPath(`/guides/${g.slug}`)).toBe(false);
    }
  });

  it("declares each public prefix with a trailing slash", () => {
    // "/guides" without the slash would also match "/guidesomething".
    for (const p of PUBLIC_PREFIXES) {
      expect(p.endsWith("/")).toBe(true);
    }
  });
});
