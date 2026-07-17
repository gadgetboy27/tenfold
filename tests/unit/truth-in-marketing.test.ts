import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLANS, VISIBLE_PLANS } from "@/lib/billing/plans";
import { entitlementsForTier } from "@/lib/billing/entitlements";

/**
 * P3 — don't sell what isn't built.
 *
 * This is the most persistent failure in this codebase, not a one-off. The
 * watermark was advertised and never implemented. .env.example listed Instagram
 * scopes the OAuth flow never requested. CLAUDE.md documented Zod env
 * validation that nothing imports, a 10x markup that video has never had, and a
 * credit table that had drifted into fiction. And the pricing page sold four
 * features — Priority queue, Analytics, 5 workspaces, White-label exports —
 * whose entitlement flags are read by nothing at all.
 *
 * The shape is always the same: someone writes the intent, the code drifts, and
 * nothing compares them. So compare them here.
 */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) out.push(p);
  }
  return out;
}

/** Entitlement flags something actually reads, outside their own declaration. */
const enforced = new Set<string>();
{
  const sources = [
    ...sourceFiles("app"),
    ...sourceFiles("components"),
    ...sourceFiles("lib"),
  ].filter((p) => !p.endsWith("lib/billing/entitlements.ts"));
  const haystack = sources.map((p) => readFileSync(p, "utf8")).join("\n");
  const flags = Object.keys(entitlementsForTier("agency"));
  for (const f of flags) {
    if (new RegExp(`\\bent\\.${f}\\b|\\.${f}\\b`).test(haystack))
      enforced.add(f);
  }
}

/** A sold bullet → the entitlement it implies. Only claims that need one. */
const CLAIM_REQUIRES: Array<[RegExp, string]> = [
  [/priority queue/i, "priorityQueue"],
  [/\banalytics\b/i, "advancedAnalytics"],
  [/workspaces/i, "maxWorkspaces"],
  [/white.?label/i, "whiteLabel"],
  [/\bapi access\b/i, "apiAccess"],
  [/watermark/i, "watermarkFree"],
];

describe("plans only sell what is built", () => {
  it("every visible plan's features map to something enforced", () => {
    const lies: string[] = [];
    for (const plan of VISIBLE_PLANS) {
      for (const feature of plan.features) {
        for (const [claim, flag] of CLAIM_REQUIRES) {
          if (claim.test(feature) && !enforced.has(flag)) {
            lies.push(
              `${plan.name}: "${feature}" needs ${flag}, which nothing reads`,
            );
          }
        }
      }
    }
    expect(
      lies,
      `pricing sells features that do not exist:\n  ${lies.join("\n  ")}`,
    ).toEqual([]);
  });

  it("hides any tier whose differentiators are not built", () => {
    // Agency's were "5 workspaces" and "white-label exports"; neither exists,
    // and there is no way to create a second workspace at all. Without them it
    // is Business with more credits at an identical price per credit — so it
    // stays hidden until it has something to sell.
    const agency = PLANS.find((p) => p.id === "agency");
    const differentiatorsBuilt =
      enforced.has("maxWorkspaces") || enforced.has("whiteLabel");
    if (!differentiatorsBuilt) {
      expect(agency?.hidden, "Agency has nothing to differentiate it yet").toBe(
        true,
      );
    }
  });

  it("keeps hidden plans defined so turning them on is one line", () => {
    // Hiding must not mean deleting: the Stripe price, credit grant and
    // entitlements stay wired, and existing subscribers keep their tier.
    const agency = PLANS.find((p) => p.id === "agency");
    expect(agency).toBeDefined();
    expect(agency?.creditsPerMonth).toBeGreaterThan(0);
    expect(entitlementsForTier("agency").isPro).toBe(true);
  });

  it("never offers a hidden plan for sale", () => {
    expect(VISIBLE_PLANS.every((p) => !p.hidden)).toBe(true);
  });
});

describe("free-tier claims", () => {
  // Comments stripped: these files now DOCUMENT the claim that was wrong, and
  // matching raw text would fail on the warning instead of the bug. (Third time
  // this trap has bitten in this codebase — hence the shared helper.)
  const marketing = [
    "components/marketing/Hero.tsx",
    "components/marketing/FAQSection.tsx",
  ].map((p) =>
    readFileSync(p, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n"),
  );

  it("does not promise 13 platforms alongside 'no card required'", () => {
    // The free tier reaches Facebook and Instagram only — everything else is
    // gated on isPro in the publish route. "No card required · Publish to up to
    // 13 platforms" was one line, and read as one promise.
    for (const src of marketing) {
      expect(src).not.toMatch(/No card required[^<]*13 platforms/);
    }
  });

  it("says which platforms the free tier actually reaches", () => {
    const faq = marketing[1];
    expect(faq).toMatch(/free plan/i);
    expect(faq).toMatch(/Facebook and Instagram/i);
  });
});

describe("legal", () => {
  const terms = readFileSync("app/terms/page.tsx", "utf8");
  const privacy = readFileSync("app/privacy/page.tsx", "utf8");

  it("names the operating entity, not just the brand", () => {
    // "operated by tenfold" names a brand. A contract has to say which legal
    // person you are contracting with.
    for (const doc of [terms, privacy]) {
      expect(doc).toContain("Blue Maunga Limited");
    }
  });

  it("lists every service that actually processes user data", () => {
    // Railway and Sentry were live and unlisted. A policy that omits a
    // processor isn't incomplete, it's wrong about where the data goes.
    for (const p of [
      "Supabase",
      "fal.ai",
      "Anthropic",
      "Ayrshare",
      "Stripe",
      "Resend",
      "Railway",
      "Sentry",
    ]) {
      expect(privacy, `${p} is not in the subprocessor list`).toContain(p);
    }
  });
});
