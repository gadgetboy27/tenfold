import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { createHmac } from "crypto";
import { signOAuthState, verifyOAuthState } from "@/lib/social/oauth-state";

const SECRET = "test-meta-app-secret";
const WORKSPACE = "11111111-1111-1111-1111-111111111111";

beforeAll(() => {
  process.env.META_APP_SECRET = SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OAuth signed state", () => {
  it("round-trips a workspaceId", () => {
    // Returns claims rather than a bare id since the state began carrying the
    // ACTOR too — the callbacks have no session, so the signature is the only
    // trustworthy source for who started a connect. Signing without a user is
    // still valid and yields a null actor.
    const state = signOAuthState(WORKSPACE);
    expect(verifyOAuthState(state)).toEqual({
      workspaceId: WORKSPACE,
      userId: null,
    });
  });

  it("rejects a tampered workspaceId (signature no longer matches)", () => {
    // Rebuilt in the legacy 3-part shape on purpose: that form is still
    // accepted for in-flight round trips, so it must still be forgery-proof.
    const state = signOAuthState(WORKSPACE);
    const parts = state.split(".");
    const issuedAt = parts[parts.length - 2];
    const sig = parts[parts.length - 1];
    const forged = `22222222-2222-2222-2222-222222222222.${issuedAt}.${sig}`;
    expect(verifyOAuthState(forged)).toBeNull();
  });

  it("rejects a state signed with a different secret", () => {
    const payload = `${WORKSPACE}.${Date.now()}`;
    const wrongSig = createHmac("sha256", "attacker-secret")
      .update(payload)
      .digest("base64url");
    expect(verifyOAuthState(`${payload}.${wrongSig}`)).toBeNull();
  });

  it("rejects malformed / empty / null states", () => {
    expect(verifyOAuthState(null)).toBeNull();
    expect(verifyOAuthState("")).toBeNull();
    expect(verifyOAuthState("not-a-valid-state")).toBeNull();
    expect(verifyOAuthState(`${WORKSPACE}.123`)).toBeNull();
  });

  it("rejects an expired state (older than the TTL)", () => {
    const state = signOAuthState(WORKSPACE);
    // Jump 11 minutes ahead — past the 10-minute TTL
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(verifyOAuthState(state)).toBeNull();
  });
});
