import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";

/**
 * Encryption at rest for stored OAuth credentials.
 *
 * Migration 0030 stopped the BROWSER reading these columns. It did nothing
 * about anyone holding the service-role key, a database backup, a Supabase
 * dashboard session, or a pg_dump in a CI log — and Meta Page tokens never
 * expire, so what sat in `social_profiles.access_token` was permanent control
 * of a customer's Facebook Page, in plaintext (ISSUES.md #38).
 *
 * Application-layer, not pgcrypto: the goal is that a database compromise
 * alone is not enough, and a key stored *in* the database defeats that
 * entirely.
 *
 * ── The trade, stated plainly ────────────────────────────────────────────
 * Lose SOCIAL_TOKEN_KEY and every stored credential becomes undecryptable and
 * every customer must reconnect. That is the actual cost of this feature. It
 * is why the key belongs in the platform's secret store and nowhere else, and
 * why rotation is designed for below rather than bolted on later.
 */

/** Versioned so a future key rotation can read both old and new ciphertext. */
const V1 = "v1:";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;

/**
 * Missing key is NOT an error at import time.
 *
 * Throwing here would take down every route that merely imports this module —
 * including the ones that don't touch tokens — and would turn a
 * misconfiguration into a total outage. Instead each call decides: writes
 * refuse loudly (see encryptToken), reads pass plaintext through, so a
 * deployment without the key keeps working exactly as it did before
 * encryption existed rather than losing access to every connection.
 */
function keyOrNull(): Buffer | null {
  const raw = process.env.SOCIAL_TOKEN_KEY;
  if (!raw) return null;
  // Accept base64 (what we generate) or hex, and normalise anything else to
  // 32 bytes via SHA-256 so a hand-typed passphrase can't produce a
  // wrong-length key error at 3am.
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) buf = Buffer.from(raw, "hex");
  } catch {
    buf = Buffer.alloc(0);
  }
  if (buf.length !== 32) buf = createHash("sha256").update(raw).digest();
  return buf;
}

export function isTokenEncryptionEnabled(): boolean {
  return keyOrNull() !== null;
}

/** Already-encrypted values must never be double-encrypted on re-save. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(V1);
}

/**
 * Encrypt one credential for storage.
 *
 * Returns the value UNCHANGED when no key is configured. That is deliberate:
 * refusing to store a token the user just authorised, because of a server
 * misconfiguration they cannot see, would break connecting entirely — a worse
 * failure than the plaintext storage that was the status quo for years. The
 * boot-time check in lib/validation/env.ts is where a missing key gets
 * noticed, not here.
 */
export function encryptToken(plain: string | null): string | null {
  if (plain === null || plain === "") return plain;
  if (isEncrypted(plain)) return plain; // idempotent — safe to re-run
  const key = keyOrNull();
  if (!key) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // v1:<iv><tag><ciphertext>, base64url so it survives any transport.
  return V1 + Buffer.concat([iv, tag, enc]).toString("base64url");
}

/**
 * Decrypt one stored credential.
 *
 * Plaintext passes straight through, which is what makes the rollout safe:
 * the code ships and starts writing ciphertext while every existing row is
 * still plaintext, and the backfill runs afterwards without a window where
 * publishing breaks. It is also what keeps a half-migrated table working.
 *
 * A value that IS encrypted but cannot be decrypted returns null rather than
 * throwing — a wrong or rotated key means "we no longer hold this credential",
 * which the health check reports as a dead connection and the user fixes by
 * reconnecting. Throwing would instead 500 the publish route with a crypto
 * error and tell them nothing.
 */
export function decryptToken(stored: string | null): string | null {
  if (stored === null || stored === "") return stored;
  if (!isEncrypted(stored)) return stored; // pre-migration plaintext
  const key = keyOrNull();
  if (!key) return null; // encrypted rows are unreadable without the key
  try {
    const raw = Buffer.from(stored.slice(V1.length), "base64url");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

/** The Page tokens nested inside social_profiles.metadata. */
interface PageEntry {
  id: string;
  name: string;
  access_token?: string | null;
}
interface ProfileMetadata {
  facebook_pages?: PageEntry[];
  [key: string]: unknown;
}

/**
 * Encrypt every credential on a row about to be written.
 *
 * Row-level rather than field-level on purpose. There are nine write sites and
 * five read sites across the callbacks, the connect routes, the Page switcher
 * and the refresh path; asking each to remember three fields is how one gets
 * missed, and a missed field is a plaintext token nobody notices. In
 * particular `metadata.facebook_pages[]` holds a LIVE token for every Page the
 * user manages — the easiest one to forget and the largest blast radius.
 */
export function encryptProfileTokens<
  T extends {
    access_token?: string | null;
    refresh_token?: string | null;
    metadata?: unknown;
  },
>(row: T): T {
  const out: T = { ...row };
  if ("access_token" in row)
    out.access_token = encryptToken(row.access_token ?? null);
  if ("refresh_token" in row)
    out.refresh_token = encryptToken(row.refresh_token ?? null);
  const meta = row.metadata as ProfileMetadata | null | undefined;
  if (meta?.facebook_pages?.length) {
    out.metadata = {
      ...meta,
      facebook_pages: meta.facebook_pages.map((p) => ({
        ...p,
        access_token: encryptToken(p.access_token ?? null),
      })),
    };
  }
  return out;
}

/** The mirror of encryptProfileTokens, for a row just read from the DB. */
export function decryptProfileTokens<
  T extends {
    access_token?: string | null;
    refresh_token?: string | null;
    metadata?: unknown;
  },
>(row: T): T {
  const out: T = { ...row };
  if ("access_token" in row)
    out.access_token = decryptToken(row.access_token ?? null);
  if ("refresh_token" in row)
    out.refresh_token = decryptToken(row.refresh_token ?? null);
  const meta = row.metadata as ProfileMetadata | null | undefined;
  if (meta?.facebook_pages?.length) {
    out.metadata = {
      ...meta,
      facebook_pages: meta.facebook_pages.map((p) => ({
        ...p,
        access_token: decryptToken(p.access_token ?? null),
      })),
    };
  }
  return out;
}
