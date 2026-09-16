import { describe, it, expect, beforeEach } from "vitest";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { verifyFalWebhook, resetJwksCache } from "@/lib/fal/webhook-signature";

/**
 * The webhook used to accept any POST that named a job — two UUIDs the job's
 * owner can read off their own network tab. fal signs deliveries; these pin
 * that the check accepts a genuine one and refuses the forgeries that matter.
 */
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwk = publicKey.export({ format: "jwk" }) as { x: string };
const fetchJwks = (async () =>
  new Response(
    JSON.stringify({ keys: [{ kty: "OKP", crv: "Ed25519", x: jwk.x }] }),
  )) as unknown as typeof fetch;

const NOW = 1_800_000_000_000;
function signed(body: string, over: Record<string, string> = {}) {
  const requestId = over.requestId ?? "req-1";
  const userId = over.userId ?? "user-1";
  const timestamp = over.timestamp ?? String(Math.floor(NOW / 1000));
  const digest = createHash("sha256").update(body).digest("hex");
  const message = Buffer.from(
    [requestId, userId, timestamp, digest].join("\n"),
  );
  const sig = sign(null, message, privateKey).toString("hex");
  return new Headers({
    "x-fal-webhook-request-id": requestId,
    "x-fal-webhook-user-id": userId,
    "x-fal-webhook-timestamp": timestamp,
    "x-fal-webhook-signature": over.signature ?? sig,
  });
}

describe("verifyFalWebhook", () => {
  beforeEach(() => resetJwksCache());
  const body = JSON.stringify({ request_id: "req-1", status: "OK" });

  it("accepts a genuine delivery", async () => {
    const out = await verifyFalWebhook(signed(body), body, {
      fetchImpl: fetchJwks,
      now: NOW,
    });
    expect(out).toEqual({ status: "valid" });
  });

  it("reports absent headers as absent, not invalid — the rollout distinguishes them", async () => {
    const out = await verifyFalWebhook(new Headers(), body, {
      fetchImpl: fetchJwks,
      now: NOW,
    });
    expect(out.status).toBe("absent");
  });

  it("refuses a body that was altered after signing", async () => {
    const tampered = body.replace("OK", "ERROR");
    const out = await verifyFalWebhook(signed(body), tampered, {
      fetchImpl: fetchJwks,
      now: NOW,
    });
    expect(out.status).toBe("invalid");
  });

  it("refuses a replay from outside the timestamp window", async () => {
    const old = String(Math.floor(NOW / 1000) - 3600);
    const out = await verifyFalWebhook(signed(body, { timestamp: old }), body, {
      fetchImpl: fetchJwks,
      now: NOW,
    });
    expect(out).toMatchObject({
      status: "invalid",
      reason: "timestamp out of range",
    });
  });

  it("refuses a signature from a key fal does not publish", async () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    const digest = createHash("sha256").update(body).digest("hex");
    const msg = Buffer.from(
      ["req-1", "user-1", String(Math.floor(NOW / 1000)), digest].join("\n"),
    );
    const forged = sign(null, msg, other).toString("hex");
    const out = await verifyFalWebhook(
      signed(body, { signature: forged }),
      body,
      { fetchImpl: fetchJwks, now: NOW },
    );
    expect(out.status).toBe("invalid");
  });
});
