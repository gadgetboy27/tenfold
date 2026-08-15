import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The direct publishing backend talks to three third-party APIs we can't hit in
 * a test, so what's asserted here is the logic that sits *around* those calls —
 * the parts that would otherwise fail silently in production: routing a
 * platform to the right backend, refusing to post video where it can't work,
 * refreshing a spent token exactly once and persisting the new one, and reading
 * the destination a post is actually going to.
 */

const updateSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updateSpy(patch);
        return {
          eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      },
    }),
  }),
}));

import {
  DIRECT_PLATFORMS,
  isDirectPlatform,
  publishDirect,
  type DirectProfile,
} from "@/lib/social/direct";

function profile(over: Partial<DirectProfile> = {}): DirectProfile {
  return {
    platform: "reddit",
    handle: "u/tester",
    access_token: "at_live",
    refresh_token: "rt_live",
    token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    platform_account_id: null,
    metadata: { default_subreddit: "testsub" },
    ...over,
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  updateSpy.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe("platform routing", () => {
  it("claims exactly the three no-review networks", () => {
    expect([...DIRECT_PLATFORMS]).toEqual(["bluesky", "reddit", "pinterest"]);
  });

  it("does not claim networks that still need Ayrshare", () => {
    // A false positive here would route X/LinkedIn/TikTok into a backend with
    // no implementation for them, turning a working publish into a 500.
    for (const p of ["twitter", "linkedin", "tiktok", "youtube", "facebook"]) {
      expect(isDirectPlatform(p)).toBe(false);
    }
    for (const p of DIRECT_PLATFORMS) expect(isDirectPlatform(p)).toBe(true);
  });
});

describe("video capability", () => {
  it("refuses video on Pinterest instead of posting a still", () => {
    // Pinterest video needs the /v5/media upload flow we haven't built. Silently
    // posting the frame instead would look like success to the user.
    return expect(
      publishDirect({
        platform: "pinterest",
        profile: profile({
          platform: "pinterest",
          metadata: { default_board_id: "b1" },
        }),
        workspaceId: "ws1",
        mediaUrl: "https://cdn.example/clip.mp4",
        isVideo: true,
        caption: "hello",
      }),
    ).rejects.toThrow(/can't post video/i);
  });
});

describe("missing destination", () => {
  it("fails with an actionable message when no subreddit is set", async () => {
    await expect(
      publishDirect({
        platform: "reddit",
        profile: profile({ metadata: null }),
        workspaceId: "ws1",
        mediaUrl: "https://cdn.example/a.jpg",
        isVideo: false,
        caption: "hello",
      }),
    ).rejects.toThrow(/subreddit/i);
  });

  it("fails when no Pinterest board is set", async () => {
    await expect(
      publishDirect({
        platform: "pinterest",
        profile: profile({ platform: "pinterest", metadata: null }),
        workspaceId: "ws1",
        mediaUrl: "https://cdn.example/a.jpg",
        isVideo: false,
        caption: "hello",
      }),
    ).rejects.toThrow(/board/i);
  });

  it("prefers the per-publish override over the stored default", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seen.push(String(init?.body ?? ""));
        return new Response(
          JSON.stringify({ json: { errors: [], data: { name: "t3_x" } } }),
          { status: 200 },
        );
      }),
    );

    await publishDirect({
      platform: "reddit",
      profile: profile(),
      workspaceId: "ws1",
      mediaUrl: "https://cdn.example/a.jpg",
      isVideo: false,
      caption: "hello",
      subreddit: "overridden",
    });

    expect(seen[0]).toContain("sr=overridden");
    expect(seen[0]).not.toContain("sr=testsub");
  });
});

describe("token refresh", () => {
  it("refreshes and persists a spent Reddit token before posting", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("access_token")) {
          return new Response(
            JSON.stringify({
              access_token: "at_fresh",
              refresh_token: "rt_new",
              expires_in: 3600,
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ json: { errors: [], data: { name: "t3_abc" } } }),
          { status: 200 },
        );
      }),
    );

    const id = await publishDirect({
      platform: "reddit",
      profile: profile({
        token_expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
      workspaceId: "ws1",
      mediaUrl: "https://cdn.example/a.jpg",
      isVideo: false,
      caption: "hello world",
    });

    expect(id).toBe("t3_abc");
    expect(calls.some((c) => c.includes("access_token"))).toBe(true);
    // Persisting is the point: Reddit tokens last an hour, so a refresh that
    // isn't written back means every publish burns a token round-trip.
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: "at_fresh",
        refresh_token: "rt_new",
      }),
    );
  });

  it("does not refresh a token that is still valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ json: { errors: [], data: { name: "t3_ok" } } }),
          { status: 200 },
        ),
      ),
    );

    await publishDirect({
      platform: "reddit",
      profile: profile(),
      workspaceId: "ws1",
      mediaUrl: "https://cdn.example/a.jpg",
      isVideo: false,
      caption: "hi",
    });

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("treats an unparseable expiry as spent rather than valid forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("access_token")
          ? new Response(
              JSON.stringify({ access_token: "at2", expires_in: 3600 }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({ json: { errors: [], data: { name: "t3_z" } } }),
              { status: 200 },
            ),
      ),
    );

    await publishDirect({
      platform: "reddit",
      profile: profile({ token_expires_at: "not-a-date" }),
      workspaceId: "ws1",
      mediaUrl: "https://cdn.example/a.jpg",
      isVideo: false,
      caption: "hi",
    });

    expect(updateSpy).toHaveBeenCalled();
  });

  it("keeps the existing refresh token when the response omits one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("access_token")
          ? new Response(
              JSON.stringify({ access_token: "at3", expires_in: 3600 }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({ json: { errors: [], data: { name: "t3_y" } } }),
              { status: 200 },
            ),
      ),
    );

    await publishDirect({
      platform: "reddit",
      profile: profile({
        token_expires_at: new Date(Date.now() - 1000).toISOString(),
        refresh_token: "rt_keepme",
      }),
      workspaceId: "ws1",
      mediaUrl: "https://cdn.example/a.jpg",
      isVideo: false,
      caption: "hi",
    });

    // Reddit's refresh response has no refresh_token field. Writing null back
    // would leave the connection unable to refresh ever again.
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: "rt_keepme" }),
    );
  });
});

describe("Reddit error handling", () => {
  it("surfaces the rejection Reddit hides inside a 200 response", async () => {
    // Reddit answers 200 with the failure in json.errors — a bare res.ok check
    // would report a rejected post as published.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            json: { errors: [["SUBREDDIT_NOTALLOWED", "you aren't allowed"]] },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      publishDirect({
        platform: "reddit",
        profile: profile(),
        workspaceId: "ws1",
        mediaUrl: "https://cdn.example/a.jpg",
        isVideo: false,
        caption: "hi",
      }),
    ).rejects.toThrow(/aren't allowed/);
  });

  it("uses the caption's first line as the title, not the hashtag block", async () => {
    let body = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        body = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ json: { errors: [], data: { name: "t3_t" } } }),
          { status: 200 },
        );
      }),
    );

    await publishDirect({
      platform: "reddit",
      profile: profile(),
      workspaceId: "ws1",
      mediaUrl: "https://cdn.example/a.jpg",
      isVideo: false,
      caption: "The actual hook\n\n#spam #tags #everywhere",
    });

    const params = new URLSearchParams(body);
    expect(params.get("title")).toBe("The actual hook");
  });
});
