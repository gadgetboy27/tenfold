import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  canManageConnections,
  CONNECTION_MANAGER_ROLES,
} from "@/lib/social/authz";
import { revokeAtProvider, manualRevokeUrl } from "@/lib/social/revoke";
import { readProfilesResponse } from "@/lib/social/profiles-response";
import type { Session } from "@/lib/auth/session";

const session = (role: string): Session => ({
  userId: "u1",
  workspaceId: "w1",
  role,
  workspaceSlug: "acme",
});

/**
 * Connecting an account is standing permission to post in a business's name,
 * and neither connect nor disconnect checked a role. A member could not publish
 * without approval, yet could repoint the workspace's Facebook at a Page they
 * owned — the gate was on the act and not on the destination.
 */
describe("who may manage connections", () => {
  it("allows the roles that already bypass the publish approval gate", () => {
    expect(canManageConnections(session("owner"))).toBe(true);
    expect(canManageConnections(session("admin"))).toBe(true);
  });

  it("refuses a member", () => {
    expect(canManageConnections(session("member"))).toBe(false);
  });

  it("refuses an unknown or empty role rather than defaulting open", () => {
    // A role we don't recognise is not evidence of privilege. Failing open
    // here would make every future role a connection manager by accident.
    expect(canManageConnections(session("viewer"))).toBe(false);
    expect(canManageConnections(session(""))).toBe(false);
  });

  it("keeps the privileged set to exactly two roles", () => {
    // Pinned so widening it is a deliberate edit with a test to update, not a
    // quiet addition someone makes while adding a role for another reason.
    expect([...CONNECTION_MANAGER_ROLES].sort()).toEqual(["admin", "owner"]);
  });
});

/**
 * Disconnect used to delete the row and stop, leaving the grant live at the
 * provider — so the one action a worried user takes destroyed the evidence
 * rather than the access. These pin the honesty of the replacement.
 */
describe("revokeAtProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never claims 'revoked' for Meta, which we cannot revoke", async () => {
    // The connect callback discards the long-lived USER token that Meta's
    // DELETE /{user-id}/permissions requires. Keeping it so we could revoke
    // would mean holding a second permanent credential in plaintext to tidy a
    // rare action — a bad trade, so we tell the truth and link instead.
    const out = await revokeAtProvider({
      platform: "facebook",
      accessToken: "page-token",
    });
    expect(out.status).toBe("manual");
    expect(out.manualUrl).toContain("facebook.com");
  });

  it("reports a network failure as failed, never as revoked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const out = await revokeAtProvider({
      platform: "youtube",
      accessToken: "a",
      refreshToken: "r",
    });
    expect(out.status).toBe("failed");
    // A false "access removed" is worse than an honest failure: it ends the
    // user's investigation at the exact moment it shouldn't.
    expect(out.manualUrl).toContain("google.com");
  });

  it("treats Google's 400 as revoked — the token is already dead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );
    const out = await revokeAtProvider({
      platform: "youtube",
      accessToken: "a",
      refreshToken: "r",
    });
    expect(out.status).toBe("revoked");
  });

  it("confirms a real revocation when the provider does", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const out = await revokeAtProvider({
      platform: "youtube",
      accessToken: "a",
      refreshToken: "r",
    });
    expect(out.status).toBe("revoked");
  });

  it("handles a missing credential without pretending it revoked one", async () => {
    const out = await revokeAtProvider({
      platform: "reddit",
      accessToken: null,
    });
    expect(out.status).toBe("manual");
  });

  it("offers a manual escape hatch for every platform we connect", async () => {
    // Including the ones we CAN revoke: a failed revocation still has to send
    // the user somewhere, and "contact support" is not an answer when someone
    // is trying to cut off access to their own account right now.
    for (const p of [
      "facebook",
      "instagram",
      "linkedin",
      "pinterest",
      "bluesky",
      "reddit",
      "tiktok",
      "youtube",
    ]) {
      expect(manualRevokeUrl(p), `${p} has no manual revoke URL`).toBeTruthy();
    }
  });
});

/**
 * Structural: the role gate has to be on EVERY connect route, not most of them.
 * There are eight, they were all written before the gate existed, and one that
 * forgets it is a full bypass — the attacker just picks that network.
 */
describe("every connect route is gated", () => {
  const routes = [
    ...readdirSync("app/api/social/connect", { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `app/api/social/connect/${d.name}/route.ts`),
    "app/api/social/connect/route.ts",
  ].filter((p) => existsSync(p));

  it("finds the connect routes at all", () => {
    // If this drops to zero the audit below is silently vacuous.
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes)("%s checks canManageConnections", (route) => {
    expect(readFileSync(route, "utf8")).toContain("canManageConnections");
  });

  it("gates disconnect too — tearing down matters as much as setting up", () => {
    const src = readFileSync("app/api/social/disconnect/route.ts", "utf8");
    expect(src).toContain("canManageConnections");
  });

  it("reads credentials BEFORE deleting them, or revocation is impossible", () => {
    // The original order deleted the row and stopped. Revoking needs the token,
    // so a refactor that moves the delete back above the read silently returns
    // us to "disconnect destroys the evidence, not the access".
    const src = readFileSync("app/api/social/disconnect/route.ts", "utf8");
    expect(src.indexOf("revokeAtProvider")).toBeLessThan(
      src.indexOf(".delete()"),
    );
  });
});

/**
 * Regression, 2026-09-02. Connecting bounced and did nothing.
 *
 * The connect handler had been changed to open OAuth in a new tab so that a
 * provider refusing before its permission screen wouldn't replace the page:
 *
 *   const tab = window.open(path, "_blank", "noopener");
 *   if (!tab) window.location.href = path;   // "fallback"
 *
 * `window.open` with `noopener` returns **null by specification** — severing
 * the handle is what noopener MEANS. So the fallback was not a fallback: it
 * ran on every click, and each press started two navigations to the same OAuth
 * URL which raced each other. Nothing typechecked wrong and nothing threw.
 */
describe("the connect flow navigates, and does not race itself", () => {
  const src = readFileSync(
    "app/(dashboard)/[workspace]/settings/social/page.tsx",
    "utf8",
  );

  it("never pairs a noopener window.open with a truthiness fallback", () => {
    // Comments are stripped first: the doc block above openConnectFlow quotes
    // the broken call deliberately, and a raw file match would fail on the
    // explanation of the bug rather than the bug.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // The pair is the bug. Either alone is fine; together they always double-fire.
    expect(code).not.toMatch(/window\.open\([^)]*noopener[^)]*\)/);
  });

  it("starts the OAuth flow with a plain navigation", () => {
    const fn = src.slice(
      src.indexOf("const openConnectFlow"),
      src.indexOf("const handleConnect"),
    );
    expect(fn).toContain("window.location.href = path");
    expect(fn).not.toContain("window.open");
  });

  it("stashes the return campaign before leaving the page", () => {
    // In-memory state does not survive a round trip through Facebook, so the
    // project someone came from has to be written down before we navigate.
    const fn = src.slice(
      src.indexOf("const openConnectFlow"),
      src.indexOf("const handleConnect"),
    );
    expect(fn).toContain("sessionStorage.setItem");
  });
});

/**
 * The profiles endpoint grew an envelope — `{ profiles, ayrshareEnabled }`
 * instead of a bare array — because the client cannot read AYRSHARE_ENABLED
 * and kept offering a hosted-linking button that could only ever error.
 *
 * Three callers parsed that array by hand. A shape change breaks all three
 * SILENTLY: .map on an object throws, .find returns undefined, a connections
 * list renders empty. Same class of quiet breakage as an embed that stops
 * resolving, so the reader is shared and both shapes are accepted.
 */
describe("readProfilesResponse", () => {
  it("reads the current envelope", () => {
    const r = readProfilesResponse<{ platform: string }>({
      profiles: [{ platform: "facebook" }],
      ayrshareEnabled: true,
    });
    expect(r.profiles).toHaveLength(1);
    expect(r.ayrshareEnabled).toBe(true);
  });

  it("still reads the legacy bare array", () => {
    // A deployed client is older than the route it talks to for as long as a
    // tab stays open. Nobody should watch their connections vanish because the
    // server rolled forward underneath them.
    const r = readProfilesResponse<{ platform: string }>([
      { platform: "reddit" },
    ]);
    expect(r.profiles).toHaveLength(1);
  });

  it("assumes Ayrshare is OFF when the flag is absent", () => {
    // Claiming a disabled integration works is the exact failure being fixed,
    // so the unknown case defaults to not offering it.
    expect(readProfilesResponse([]).ayrshareEnabled).toBe(false);
    expect(readProfilesResponse({}).ayrshareEnabled).toBe(false);
  });

  it("never throws on junk, and never returns a non-array", () => {
    // This feeds .map in three components; a null here is a white screen.
    for (const junk of [null, undefined, 0, "x", { profiles: "nope" }]) {
      expect(Array.isArray(readProfilesResponse(junk).profiles)).toBe(true);
    }
  });
});
