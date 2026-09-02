import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every route that can change WHERE a workspace publishes must be role-gated
 * and must leave a trace.
 *
 * These were written per-route and drifted: the gate landed on connect and
 * disconnect, and missed `facebook/page` — the one route that performs the
 * exact attack lib/social/authz.ts describes in its own comment, repointing
 * the workspace's Facebook at a Page the actor owns. `destination` was open
 * for the same reason one level down. The audit log missed Bluesky, the ONLY
 * connect path that always has a real session to attribute.
 *
 * A list of routes checked one at a time is how that happens. This walks the
 * directory instead, so a NEW route is covered the day it is added rather than
 * the day someone thinks to look.
 */

const SOCIAL_API = "app/api/social";

/** Every route.ts under app/api/social. */
function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** Source with comments stripped — these files DISCUSS the things asserted. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const files = routeFiles(SOCIAL_API);

/**
 * A route that WRITES to social_profiles changes the connection itself.
 *
 * OAuth `connect/*` routes only redirect to the provider and are gated
 * separately; the callback is where the write happens. Reading is not
 * changing, so a `.select()`-only route is out of scope.
 */
const writers = files.filter((f) => {
  const src = code(f);
  return (
    src.includes('from("social_profiles")') &&
    /\.upsert\(|\.insert\(|\.update\(|\.delete\(/.test(src)
  );
});

describe("connection routes are gated and logged", () => {
  it("finds the routes at all — a passing empty sweep proves nothing", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(writers.length).toBeGreaterThan(5);
  });

  for (const f of writers) {
    it(`${f} records who changed the connection`, () => {
      expect(code(f)).toContain("recordSocialEvent");
    });
  }

  /**
   * Callbacks are excluded from the ROLE check on purpose: a provider redirect
   * arrives with whatever cookies it arrives with and has no session to check
   * a role against. They authenticate the round trip with the HMAC-signed
   * state instead, which is why the actor travels inside that signature.
   */
  const sessionWriters = writers.filter((f) => !f.includes("/callback/"));

  for (const f of sessionWriters) {
    it(`${f} is owner/admin only`, () => {
      expect(code(f)).toContain("canManageConnections");
    });
  }

  it("still covers the route the gate originally missed", () => {
    // Named explicitly: the directory walk above would keep passing if this
    // file were deleted, and it is the one with the sharpest teeth.
    const page = `${SOCIAL_API}/facebook/page/route.ts`;
    expect(writers).toContain(page);
    expect(code(page)).toContain("canManageConnections");
    expect(code(page)).toContain("page_switched");
  });

  it("logs the Bluesky connect, which has the best actor of any of them", () => {
    const bs = `${SOCIAL_API}/connect/bluesky/route.ts`;
    expect(code(bs)).toContain("recordSocialEvent");
    // The app password must never reach the log. Sliced from the CALL, not
    // the import — anchoring on the bare name matches `import { ... }` on
    // line 1 and silently swallows the whole file.
    const src = code(bs);
    const start = src.indexOf("await recordSocialEvent(");
    expect(start).toBeGreaterThan(-1);
    const call = src.slice(start, src.indexOf(");", start) + 2);
    expect(call).not.toContain("appPassword");
    expect(call).not.toContain("access_token");
  });
});
