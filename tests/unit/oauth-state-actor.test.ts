import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signOAuthState, verifyOAuthState } from "@/lib/social/oauth-state";
import { createHmac } from "crypto";

/**
 * The OAuth callbacks have no session — a provider redirect arrives with
 * whatever cookies it arrives with — so the signed `state` is the only thing
 * they can trust. It carried the workspace but not the actor, which is why
 * every `connected` row in social_connection_events had a null actor while
 * disconnects recorded one. Half a security log.
 */
const SECRET = "test-meta-app-secret";
const PRIOR = process.env.META_APP_SECRET;
beforeEach(() => {
  process.env.META_APP_SECRET = SECRET;
});
afterEach(() => {
  // Only our own key, never a wholesale process.env reassignment — that
  // clobbers concurrently-running suites (see token-crypto.test.ts).
  if (PRIOR === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = PRIOR;
});

const WS = "a1b2c3d4-0001-0001-0001-000000000001";
const USER = "47a1e1bc-7b88-4f3f-96da-585c3b734871";

describe("signed state carries the actor", () => {
  it("round-trips both the workspace and the user", () => {
    expect(verifyOAuthState(signOAuthState(WS, USER))).toEqual({
      workspaceId: WS,
      userId: USER,
    });
  });

  it("still accepts a state signed without an actor", () => {
    // Someone can be mid-OAuth when a deploy lands. Failing their connect for
    // no security gain would be a worse outcome than a null actor.
    const signed = signOAuthState(WS);
    expect(verifyOAuthState(signed)).toEqual({ workspaceId: WS, userId: null });
  });

  it("accepts the OLD 3-part format from before actors existed", () => {
    // Hand-built in the pre-actor shape: `${ws}.${issuedAt}.${sig}`.
    const issued = Date.now();
    const payload = `${WS}.${issued}`;
    const sig = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");
    expect(verifyOAuthState(`${payload}.${sig}`)).toEqual({
      workspaceId: WS,
      userId: null,
    });
  });
});

describe("the actor cannot be forged", () => {
  it("rejects a state whose user id was swapped after signing", () => {
    // An unsigned actor would be worse than none: it could attribute a
    // connection to somebody else in the security log.
    const signed = signOAuthState(WS, USER);
    const parts = signed.split(".");
    parts[1] = "00000000-0000-0000-0000-000000000000";
    expect(verifyOAuthState(parts.join("."))).toBeNull();
  });

  it("rejects a swapped workspace id", () => {
    const parts = signOAuthState(WS, USER).split(".");
    parts[0] = "b1b2c3d4-0002-0002-0002-000000000002";
    expect(verifyOAuthState(parts.join("."))).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const signed = signOAuthState(WS, USER);
    expect(verifyOAuthState(signed.slice(0, -1) + "X")).toBeNull();
  });

  it("rejects an expired state", () => {
    const old = Date.now() - 11 * 60 * 1000; // TTL is 10 minutes
    const payload = `${WS}.${USER}.${old}`;
    const sig = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");
    expect(verifyOAuthState(`${payload}.${sig}`)).toBeNull();
  });

  it("rejects junk without throwing", () => {
    for (const junk of [null, "", "a", "a.b", "a.b.c.d.e"]) {
      expect(verifyOAuthState(junk)).toBeNull();
    }
  });
});
