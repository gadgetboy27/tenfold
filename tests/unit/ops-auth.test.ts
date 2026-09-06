import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isOpsRequest,
  isInternalRequest,
  internalSecretHeader,
} from "@/lib/api/ops-auth";

/**
 * The bug these guard: every ops endpoint checked
 * `process.env.CRON_SECRET || "dev-secret"`. A constant that lives in the
 * repository is not a secret, so any deployment that hadn't set CRON_SECRET
 * accepted a token anyone could read — and `GET /api/cron/sweep-jobs` marks
 * jobs terminal and moves credits.
 *
 * The rule is fail closed: no secret configured means nothing authenticates.
 * "The cron stops running" is visible and recoverable; "anyone can run the
 * cron" is neither.
 */

const ORIGINAL = process.env.CRON_SECRET;

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/cron/sweep-jobs", { headers });
}

beforeEach(() => {
  delete process.env.CRON_SECRET;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

describe("ops auth fails closed", () => {
  it("rejects the old hardcoded fallback when no secret is set", () => {
    // The specific regression: this used to be a valid credential.
    expect(isOpsRequest(req({ Authorization: "Bearer dev-secret" }))).toBe(
      false,
    );
    expect(isInternalRequest(req({ "x-internal-secret": "dev-secret" }))).toBe(
      false,
    );
  });

  it("rejects every token when no secret is set", () => {
    expect(isOpsRequest(req())).toBe(false);
    expect(isOpsRequest(req({ Authorization: "Bearer " }))).toBe(false);
    expect(isOpsRequest(req({ Authorization: "" }))).toBe(false);
    expect(isOpsRequest(req({ Authorization: "Bearer anything" }))).toBe(false);
  });

  it("rejects an empty-string secret rather than matching an empty header", () => {
    // An empty env var is unset, not "the secret is the empty string".
    process.env.CRON_SECRET = "";
    expect(isOpsRequest(req({ Authorization: "Bearer " }))).toBe(false);
    expect(isInternalRequest(req({ "x-internal-secret": "" }))).toBe(false);
  });
});

describe("ops auth accepts only the configured secret", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret-value";
  });

  it("accepts the exact Bearer token", () => {
    expect(isOpsRequest(req({ Authorization: "Bearer s3cret-value" }))).toBe(
      true,
    );
  });

  it("rejects near-misses", () => {
    for (const h of [
      "Bearer s3cret-valu", // short
      "Bearer s3cret-valuex", // long
      "Bearer  s3cret-value", // extra INTERNAL space is not normalised away
      "bearer s3cret-value", // wrong case scheme
      "s3cret-value", // no scheme
      "Basic s3cret-value", // wrong scheme
      "Bearer dev-secret",
    ]) {
      expect(isOpsRequest(req({ Authorization: h })), h).toBe(false);
    }
  });

  it("treats surrounding whitespace as equivalent, because HTTP does", () => {
    // Not leniency of ours: the Fetch Headers API strips leading/trailing
    // whitespace from a header value, so this is byte-identical by the time
    // any code sees it. Pinned so nobody 'hardens' it with a trim() that
    // implies a difference the transport already erased.
    expect(isOpsRequest(req({ Authorization: "Bearer s3cret-value " }))).toBe(
      true,
    );
  });

  it("keeps the two header conventions separate", () => {
    // The Bearer form must not be satisfiable via the internal header, or a
    // caller that leaks one has leaked both routes into each other.
    expect(isOpsRequest(req({ "x-internal-secret": "s3cret-value" }))).toBe(
      false,
    );
    expect(
      isInternalRequest(req({ Authorization: "Bearer s3cret-value" })),
    ).toBe(false);
    expect(
      isInternalRequest(req({ "x-internal-secret": "s3cret-value" })),
    ).toBe(true);
  });
});

describe("internalSecretHeader", () => {
  it("is null when unset, so callers skip instead of earning a 401", () => {
    expect(internalSecretHeader()).toBeNull();
  });

  it("round-trips with its own verifier", () => {
    process.env.CRON_SECRET = "s3cret-value";
    const header = internalSecretHeader();
    expect(header).toEqual({ "x-internal-secret": "s3cret-value" });
    expect(isInternalRequest(req(header!))).toBe(true);
  });
});
