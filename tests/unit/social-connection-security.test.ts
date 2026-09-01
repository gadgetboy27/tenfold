import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  canManageConnections,
  CONNECTION_MANAGER_ROLES,
} from "@/lib/social/authz";
import { revokeAtProvider, manualRevokeUrl } from "@/lib/social/revoke";
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
