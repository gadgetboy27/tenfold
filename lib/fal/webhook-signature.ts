import {
  createHash,
  createPublicKey,
  verify as cryptoVerify,
} from "node:crypto";

/**
 * fal.ai webhook signature verification.
 *
 * The webhook route used to accept any POST that named a real job id and one
 * of its request ids — both UUIDs, both visible to the user who owns the job
 * (and to anything that reads their network tab). That is enough to forge a
 * "completed" payload pointing at an arbitrary URL, which the handler then
 * fetches and stores as an asset. fal signs every delivery; checking it
 * closes the door.
 *
 * Scheme (fal docs, "Webhooks → Verification"): four headers —
 *   X-Fal-Webhook-Request-Id, X-Fal-Webhook-User-Id,
 *   X-Fal-Webhook-Timestamp, X-Fal-Webhook-Signature (hex, Ed25519)
 * — and the signed message is
 *   `${request_id}\n${user_id}\n${timestamp}\n${sha256hex(rawBody)}`
 * verified against any key in https://rest.alpha.fal.ai/.well-known/jwks.json
 * (OKP / Ed25519 JWKs). Timestamps older than a few minutes are rejected so
 * a captured delivery can't be replayed later.
 *
 * Rollout: `FAL_WEBHOOK_STRICT=true` makes an invalid or missing signature a
 * 401. Unset, the route still verifies and records the outcome on the log
 * row, but processes the delivery — so a mistake here shows up as a column
 * of "invalid" in webhook_logs, not as every generation in the product
 * silently stalling. Flip to strict once the log shows nothing but "valid".
 */

export const FAL_JWKS_URL = "https://rest.alpha.fal.ai/.well-known/jwks.json";
const TIMESTAMP_TOLERANCE_SEC = 5 * 60;
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

export type SignatureOutcome =
  | { status: "valid" }
  | { status: "absent" }
  | { status: "invalid"; reason: string };

interface Jwk {
  kty: string;
  crv?: string;
  x?: string;
}

let cached: { keys: Jwk[]; at: number } | null = null;

async function jwks(fetchImpl: typeof fetch): Promise<Jwk[]> {
  if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;
  const res = await fetchImpl(FAL_JWKS_URL, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  cached = { keys: data.keys ?? [], at: Date.now() };
  return cached.keys;
}

/** Test seam — drop the cached key set. */
export function resetJwksCache(): void {
  cached = null;
}

export async function verifyFalWebhook(
  headers: Headers,
  rawBody: string,
  opts: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<SignatureOutcome> {
  const requestId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const timestamp = headers.get("x-fal-webhook-timestamp");
  const signature = headers.get("x-fal-webhook-signature");
  if (!requestId || !userId || !timestamp || !signature) {
    return { status: "absent" };
  }

  const ts = Number(timestamp);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SEC) {
    return { status: "invalid", reason: "timestamp out of range" };
  }

  const digest = createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from(
    [requestId, userId, timestamp, digest].join("\n"),
  );
  let sig: Buffer;
  try {
    sig = Buffer.from(signature, "hex");
    if (sig.length !== 64) throw new Error("length");
  } catch {
    return { status: "invalid", reason: "malformed signature" };
  }

  let keys: Jwk[];
  try {
    keys = await jwks(opts.fetchImpl ?? fetch);
  } catch (err) {
    return {
      status: "invalid",
      reason: `jwks unavailable: ${err instanceof Error ? err.message : "?"}`,
    };
  }

  for (const jwk of keys) {
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x) continue;
    try {
      const key = createPublicKey({
        key: { kty: "OKP", crv: "Ed25519", x: jwk.x },
        format: "jwk",
      });
      if (cryptoVerify(null, message, key, sig)) return { status: "valid" };
    } catch {
      /* try the next key */
    }
  }
  return { status: "invalid", reason: "no key verified the signature" };
}

/** Whether an unverified delivery must be refused (vs. logged and processed). */
export function falWebhookStrict(): boolean {
  return process.env.FAL_WEBHOOK_STRICT === "true";
}
