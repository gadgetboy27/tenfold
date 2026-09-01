import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptToken,
  decryptToken,
  isEncrypted,
  encryptProfileTokens,
  decryptProfileTokens,
  isTokenEncryptionEnabled,
} from "@/lib/social/token-crypto";

/**
 * ISSUES.md #38. Meta Page tokens never expire, so a plaintext
 * `social_profiles.access_token` was permanent control of a customer's
 * Facebook Page to anyone with a backup or a dashboard session.
 *
 * The rollout is the dangerous part, not the cipher: code ships and starts
 * writing ciphertext while every existing row is still plaintext, and a
 * backfill runs afterwards. Every test below is about surviving that
 * half-migrated state without a window where publishing breaks.
 */
const KEY = Buffer.alloc(32, 7).toString("base64");
const PRIOR = process.env.SOCIAL_TOKEN_KEY;

// Touch ONLY our own variable, and never reassign process.env wholesale.
// Vitest shares a process between concurrently-running suites, so replacing
// the whole env object clobbers variables other tests are relying on
// mid-flight — which shows up as unrelated integration tests failing at
// random, a different set each run.
beforeEach(() => {
  process.env.SOCIAL_TOKEN_KEY = KEY;
});
afterEach(() => {
  if (PRIOR === undefined) delete process.env.SOCIAL_TOKEN_KEY;
  else process.env.SOCIAL_TOKEN_KEY = PRIOR;
});

describe("round trip", () => {
  it("recovers exactly what went in", () => {
    const secret = "EAAB1234|weird/chars+and=padding";
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it("produces different ciphertext each time for the same input", () => {
    // A fresh IV per encryption. Identical ciphertext would leak that two
    // workspaces hold the same credential.
    const a = encryptToken("same");
    const b = encryptToken("same");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same");
    expect(decryptToken(b)).toBe("same");
  });

  it("never stores anything resembling the plaintext", () => {
    const enc = encryptToken("EAAsupersecrettoken") ?? "";
    expect(enc).not.toContain("supersecret");
    expect(enc.startsWith("v1:")).toBe(true);
  });

  it("rejects a tampered ciphertext rather than returning garbage", () => {
    // GCM is authenticated; a flipped byte must fail closed, not decrypt to
    // rubbish that then gets sent to Facebook as a credential.
    const enc = encryptToken("token")!;
    const broken = enc.slice(0, -2) + (enc.endsWith("A") ? "B" : "A");
    expect(decryptToken(broken)).toBeNull();
  });
});

describe("the half-migrated table", () => {
  it("passes pre-migration plaintext straight through", () => {
    // The whole rollout depends on this: ciphertext starts being written
    // while every existing row is still plaintext.
    expect(decryptToken("plain-old-token")).toBe("plain-old-token");
  });

  it("is idempotent — re-saving a row cannot double-encrypt", () => {
    // Several routes re-upsert an existing row (the Page switcher, refresh).
    // Encrypting twice would make it undecryptable in one pass.
    const once = encryptToken("tok")!;
    expect(encryptToken(once)).toBe(once);
    expect(decryptToken(encryptToken(once))).toBe("tok");
  });

  it("leaves nulls and empties alone", () => {
    // token_expires_at is null for Bluesky and Meta Page tokens; refresh_token
    // is null for Facebook. Encrypting null would write the string "null".
    expect(encryptToken(null)).toBeNull();
    expect(decryptToken(null)).toBeNull();
    expect(encryptToken("")).toBe("");
  });
});

describe("when the key is missing", () => {
  it("does not encrypt, so connecting still works", () => {
    // Refusing to store a token the user just authorised — over a server
    // misconfiguration they cannot see — is worse than the plaintext status
    // quo it replaces.
    delete process.env.SOCIAL_TOKEN_KEY;
    expect(isTokenEncryptionEnabled()).toBe(false);
    expect(encryptToken("tok")).toBe("tok");
  });

  it("returns null for rows that ARE encrypted, instead of throwing", () => {
    // A wrong or rotated key means "we no longer hold this credential" — the
    // health check reports a dead connection and the user reconnects.
    // Throwing would 500 the publish route with a crypto error instead.
    const enc = encryptToken("tok")!;
    delete process.env.SOCIAL_TOKEN_KEY;
    expect(decryptToken(enc)).toBeNull();
  });
});

describe("whole-row helpers", () => {
  const row = {
    access_token: "page-token",
    refresh_token: "refresh-token",
    metadata: {
      facebook_pages: [
        { id: "1", name: "LetsRoam", access_token: "page-1-token" },
        { id: "2", name: "Other", access_token: "page-2-token" },
      ],
      default_subreddit: "r/test",
    },
  };

  it("encrypts the nested Page tokens, not just the columns", () => {
    // metadata.facebook_pages[] holds a LIVE token for every Page the user
    // manages — the easiest field to forget and the largest blast radius.
    const enc = encryptProfileTokens(row);
    expect(isEncrypted(enc.access_token)).toBe(true);
    expect(isEncrypted(enc.refresh_token)).toBe(true);
    for (const p of enc.metadata.facebook_pages) {
      expect(isEncrypted(p.access_token)).toBe(true);
    }
  });

  it("round-trips a whole row and preserves everything else", () => {
    const back = decryptProfileTokens(encryptProfileTokens(row));
    expect(back.access_token).toBe("page-token");
    expect(back.refresh_token).toBe("refresh-token");
    expect(back.metadata.facebook_pages.map((p) => p.access_token)).toEqual([
      "page-1-token",
      "page-2-token",
    ]);
    // Non-credential metadata must survive untouched — Reddit and Pinterest
    // store their destination here and publishing fails without it.
    expect(back.metadata.default_subreddit).toBe("r/test");
    expect(back.metadata.facebook_pages[0].name).toBe("LetsRoam");
  });

  it("handles a row with no metadata and no refresh token", () => {
    const enc = encryptProfileTokens({ access_token: "t" });
    expect(decryptProfileTokens(enc).access_token).toBe("t");
  });
});
