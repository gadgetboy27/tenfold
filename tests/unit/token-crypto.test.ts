import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  encryptToken,
  decryptToken,
  isEncrypted,
  encryptTokenOrNull,
  decryptTokenOrNull,
} from "@/lib/security/token-crypto";

/**
 * Encryption at rest for OAuth tokens. These tokens can't be hashed — we have
 * to hand them to Meta and LinkedIn — so the bar is: a database dump, a leaked
 * service-role key, or read access to the table yields nothing usable.
 */

const KEY = randomBytes(32).toString("base64");
const TOKEN = "EAAB1x9ZC-a-realistic-looking-page-token_0123456789";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("token encryption", () => {
  it("round-trips a token", () => {
    expect(decryptToken(encryptToken(TOKEN))).toBe(TOKEN);
  });

  it("does not leave the plaintext anywhere in the ciphertext", () => {
    const enc = encryptToken(TOKEN);
    expect(enc).not.toContain(TOKEN);
    expect(enc).not.toContain("EAAB1x9ZC");
  });

  it("produces a different ciphertext every time", () => {
    // A fresh IV per encryption. Reusing a nonce with GCM is catastrophic, and
    // identical ciphertexts would also reveal when two workspaces share a token.
    const a = encryptToken(TOKEN);
    const b = encryptToken(TOKEN);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(decryptToken(b));
  });

  it("refuses a tampered ciphertext instead of returning garbage", () => {
    // GCM authenticates. Without that, a mangled value would decrypt to noise
    // and we would send it to Meta as someone's credential.
    const enc = encryptToken(TOKEN);
    const parts = enc.split(":");
    const ct = Buffer.from(parts[4], "base64url");
    ct[0] ^= 0xff;
    parts[4] = ct.toString("base64url");
    expect(() => decryptToken(parts.join(":"))).toThrow();
  });

  it("refuses a swapped auth tag", () => {
    const a = encryptToken(TOKEN).split(":");
    const b = encryptToken("something else").split(":");
    a[3] = b[3]; // graft b's tag onto a
    expect(() => decryptToken(a.join(":"))).toThrow();
  });

  it("cannot be read with a different key", () => {
    const enc = encryptToken(TOKEN);
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptToken(enc)).toThrow();
  });

  it("reads tokens written before encryption existed", () => {
    // The rollout depends on this: existing plaintext rows keep working and get
    // re-encrypted on their next write. Without it, every connected account
    // would break the moment this deployed.
    expect(decryptToken("plain-legacy-token")).toBe("plain-legacy-token");
    expect(isEncrypted("plain-legacy-token")).toBe(false);
    expect(isEncrypted(encryptToken(TOKEN))).toBe(true);
  });

  it("survives tokens with colons in them", () => {
    // The format is colon-delimited; a token containing colons must not break
    // the parse. LinkedIn's ids look like urn:li:share:123.
    const weird = "urn:li:oauth:abc:def";
    expect(decryptToken(encryptToken(weird))).toBe(weird);
  });

  it("handles the nullable columns", () => {
    expect(encryptTokenOrNull(null)).toBeNull();
    expect(encryptTokenOrNull("")).toBeNull();
    expect(decryptTokenOrNull(null)).toBeNull();
    const enc = encryptTokenOrNull(TOKEN);
    expect(decryptTokenOrNull(enc)).toBe(TOKEN);
  });
});

describe("key handling", () => {
  it("refuses to run without a key rather than storing plaintext", () => {
    // The whole point. A plaintext fallback would "work" and silently undo the
    // encryption — the same silent-downgrade shape as every other fault here.
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken(TOKEN)).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("rejects a key of the wrong size loudly", () => {
    process.env.TOKEN_ENCRYPTION_KEY =
      Buffer.from("too-short").toString("base64");
    expect(() => encryptToken(TOKEN)).toThrow(/32 bytes/);
  });

  it("accepts hex as well as base64", () => {
    const hex = randomBytes(32).toString("hex");
    process.env.TOKEN_ENCRYPTION_KEY = hex;
    expect(decryptToken(encryptToken(TOKEN))).toBe(TOKEN);
  });

  it("still reads legacy plaintext with no key configured", () => {
    // Decrypting a plaintext value must not need the key — otherwise a missing
    // key turns a read into a crash for rows that were never encrypted.
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(decryptToken("legacy")).toBe("legacy");
  });
});

describe("every token path is wired", () => {
  const src = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  // Anything that writes a token column must encrypt; anything that hands one
  // to a vendor must decrypt. A miss in either direction is silent — plaintext
  // in the table, or ciphertext posted to Meta as a credential.
  const WRITERS = [
    "app/api/social/callback/facebook/route.ts",
    "app/api/social/facebook/page/route.ts",
    "lib/social/tokens.ts",
  ];

  it.each(WRITERS)("%s encrypts every token it stores", (path) => {
    const s = src(path);
    // Assignments only — `access_token: string` is a type declaration, not a
    // write, and matching it would flag the interface rather than the code.
    const writes = (s.match(/access_token:\s*([^,;\n]+)/g) ?? []).filter(
      (w) => !/:\s*(string|number|boolean)\b/.test(w),
    );
    expect(
      writes.length,
      `${path} appears to store no token at all`,
    ).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w, `${path} stores a token without encrypting: ${w}`).toMatch(
        /encryptToken|decryptToken/,
      );
    }
  });

  it("encrypts the page tokens hidden inside the metadata blob", () => {
    // metadata.facebook_pages[] holds a live token for EVERY page the user
    // manages — the largest concentration of credentials here, and easy to miss
    // because it isn't a column.
    const s = src("app/api/social/callback/facebook/route.ts");
    expect(s).toMatch(/facebook_pages\s*=\s*pages\.map[\s\S]*?encryptToken/);
  });

  it("decrypts before handing a token to Meta", () => {
    const s = src("app/api/publish/route.ts");
    expect(s).toContain("decryptToken(row.access_token)");
    // The Page override reads from metadata, which the map above never touched.
    expect(s).toContain("decryptToken(chosen.access_token)");
  });
});
