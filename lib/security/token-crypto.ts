import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for OAuth tokens.
 *
 * The tokens in social_profiles are not passwords we can hash — we have to send
 * them to Meta and LinkedIn, so they must come back out. That means reversible
 * encryption with a key kept somewhere the database isn't: a DB dump, a leaked
 * service-role key, or a support engineer with read access no longer yields
 * anything usable.
 *
 * AES-256-GCM, because it authenticates as well as encrypts: a tampered
 * ciphertext fails loudly on decrypt rather than quietly producing garbage that
 * we would then send to Meta as someone's credential.
 *
 * Stored format:  enc:v1:<iv>:<authTag>:<ciphertext>   (each part base64url)
 *
 * The version is in the string, not in a config, so a future key rotation can
 * read old values while writing new ones.
 */

const PREFIX = "enc:v1:";
const IV_BYTES = 12; // 96-bit nonce — the size GCM is specified for
const KEY_BYTES = 32; // AES-256

/** True if a stored value is one of ours. Plaintext from before this existed
 *  simply isn't, which is what lets the two coexist during rollout. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    // Deliberately fatal. Falling back to plaintext would "work" and quietly
    // undo the entire point — the exact silent-downgrade pattern that let a
    // dozen other faults live in this codebase unnoticed. Generate one with:
    //   openssl rand -base64 32
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set — refusing to store social tokens in plaintext",
    );
  }
  // Accept base64 or hex; both are what `openssl rand` hands you.
  const key = /^[0-9a-fA-F]{64}$/.test(raw.trim())
    ? Buffer.from(raw.trim(), "hex")
    : Buffer.from(raw.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES); // fresh per encryption — never reuse with GCM
  const cipher = createCipheriv("aes-256-gcm", loadKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString("base64url")).join(":");
}

/**
 * Decrypt a stored token.
 *
 * Values that were written before encryption existed are returned as-is. That
 * passthrough is what makes this deployable without a migration window: reads
 * keep working, and each token is re-encrypted the next time it is written.
 * Remove it once nothing plaintext remains.
 */
export function decryptToken(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":");
  if (!iv || !tag || !ct) {
    throw new Error("Malformed encrypted token");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    loadKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  // Throws if the ciphertext or tag was altered, or the key is wrong — which is
  // the point. Better a failed publish than a corrupted credential.
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt when there's something to encrypt. Convenience for nullable columns. */
export function encryptTokenOrNull(
  v: string | null | undefined,
): string | null {
  return v ? encryptToken(v) : null;
}

/** Decrypt when there's something to decrypt. */
export function decryptTokenOrNull(
  v: string | null | undefined,
): string | null {
  return v ? decryptToken(v) : null;
}
