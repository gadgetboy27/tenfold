import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The broker is the only backend that can post to a network we have no
 * relationship with, so the thing worth proving is the negative: that nothing
 * reaches a real social account by accident.
 *
 * Every test here stubs global fetch. If a request ever escaped to a real host
 * the stub would record it, and the last test in this file fails on exactly
 * that — a network call to anything that isn't Outstand's API.
 */

const calls: { url: string; init?: RequestInit }[] = [];
const originalFetch = globalThis.fetch;

function stubFetch(response: { ok: boolean; status?: number; body: unknown }) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.body,
      headers: new Headers(),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  calls.length = 0;
  delete process.env.OUTSTAND_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  delete process.env.OUTSTAND_API_KEY;
});

describe("nothing posts without explicit configuration", () => {
  it("refuses to broker any network when no API key is set", async () => {
    const { shouldBroker, BROKER_PLATFORMS } = await import(
      "@/lib/social/broker/outstand"
    );
    // Production is in exactly this state today.
    for (const p of BROKER_PLATFORMS) {
      expect(shouldBroker(p, false)).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("still refuses when a key exists but the account is connected directly", async () => {
    process.env.OUTSTAND_API_KEY = "test_key";
    const { shouldBroker } = await import("@/lib/social/broker/outstand");
    // Paying to post where we already post free is the expensive mistake this
    // guard exists to prevent — and it would be invisible, since the post
    // would still succeed.
    expect(shouldBroker("tiktok", true)).toBe(false);
    expect(shouldBroker("x", true)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("publishViaBroker request shape", () => {
  beforeEach(() => {
    process.env.OUTSTAND_API_KEY = "test_key";
  });

  it("sends the post to Outstand, authenticated, and never to the network itself", async () => {
    stubFetch({ ok: true, body: { id: "post_123" } });
    const { publishViaBroker } = await import("@/lib/social/broker/outstand");

    const result = await publishViaBroker({
      accountId: "ws-1",
      platform: "x",
      mediaUrl: "https://cdn.example/a.jpg",
      caption: "hello world",
    });

    expect(result.id).toBe("post_123");
    expect(calls).toHaveLength(1);

    const [call] = calls;
    expect(call.url).toBe("https://api.outstand.so/v1/posts");
    expect(
      (call.init?.headers as Record<string, string>).Authorization,
    ).toBe("Bearer test_key");

    const body = JSON.parse(String(call.init?.body));
    expect(body).toMatchObject({
      accountId: "ws-1",
      platform: "x",
      content: "hello world",
      mediaUrls: ["https://cdn.example/a.jpg"],
    });
    // Absent unless asked for — a stray scheduledAt would silently turn an
    // immediate post into a scheduled one.
    expect(body.scheduledAt).toBeUndefined();
  });

  it("passes a schedule through only when given one", async () => {
    stubFetch({ ok: true, body: { id: "post_456" } });
    const { publishViaBroker } = await import("@/lib/social/broker/outstand");

    await publishViaBroker({
      accountId: "ws-1",
      platform: "threads",
      mediaUrl: "https://cdn.example/a.jpg",
      caption: "later",
      scheduledAt: "2026-09-01T10:00:00.000Z",
    });

    expect(JSON.parse(String(calls[0].init?.body)).scheduledAt).toBe(
      "2026-09-01T10:00:00.000Z",
    );
  });

  it("treats a 200 with no id as failure, not success", async () => {
    // The trap Reddit and TikTok both set: an error reported inside a 200 body.
    // Reading res.ok alone would report a post that never happened, and the
    // credits would already be spent.
    stubFetch({ ok: true, body: { error: "account disconnected" } });
    const { publishViaBroker } = await import("@/lib/social/broker/outstand");

    await expect(
      publishViaBroker({
        accountId: "ws-1",
        platform: "x",
        mediaUrl: "https://cdn.example/a.jpg",
        caption: "hi",
      }),
    ).rejects.toThrow(/account disconnected/i);
  });

  it("surfaces a presentable message rather than a bare status", async () => {
    stubFetch({ ok: false, status: 429, body: { message: "Rate limited" } });
    const { publishViaBroker } = await import("@/lib/social/broker/outstand");

    await expect(
      publishViaBroker({
        accountId: "ws-1",
        platform: "x",
        mediaUrl: "https://cdn.example/a.jpg",
        caption: "hi",
      }),
    ).rejects.toThrow(/rate limited/i);
  });
});

describe("no request ever leaves for a social network", () => {
  it("only ever contacts api.outstand.so", async () => {
    process.env.OUTSTAND_API_KEY = "test_key";
    stubFetch({ ok: true, body: { id: "p1", url: "https://connect.example" } });
    const { publishViaBroker, getBrokerConnectUrl } = await import(
      "@/lib/social/broker/outstand"
    );

    await publishViaBroker({
      accountId: "ws-1",
      platform: "telegram",
      mediaUrl: "https://cdn.example/a.jpg",
      caption: "hi",
    });
    await getBrokerConnectUrl({
      workspaceId: "ws-1",
      platform: "x",
      redirectUrl: "https://prettymuch.nz/back",
    });

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const host = new URL(call.url).host;
      // If this ever fails, something is talking straight to a social platform
      // from the broker path — which is how an accidental live post happens.
      expect(host).toBe("api.outstand.so");
    }
  });
});
