import { describe, expect, it } from "vitest";
import {
  EMPTY_TIKTOK_DRAFT,
  tiktokDraftProblem,
  tiktokOptionsFromDraft,
  type TikTokDraft,
} from "@/lib/social/tiktok-options";

const draft = (over: Partial<TikTokDraft> = {}): TikTokDraft => ({
  ...EMPTY_TIKTOK_DRAFT,
  ...over,
});

describe("TikTok posting screen", () => {
  it("starts with nothing chosen and nothing enabled", () => {
    expect(EMPTY_TIKTOK_DRAFT.privacy).toBeNull();
    expect(EMPTY_TIKTOK_DRAFT.allowComment).toBe(false);
    expect(EMPTY_TIKTOK_DRAFT.allowDuet).toBe(false);
    expect(EMPTY_TIKTOK_DRAFT.allowStitch).toBe(false);
    expect(EMPTY_TIKTOK_DRAFT.commercial.enabled).toBe(false);
  });

  it("will not post until who-can-view is chosen", () => {
    expect(tiktokDraftProblem(draft())).toMatch(/who can view/);
    expect(tiktokOptionsFromDraft(draft())).toBeNull();
  });

  it("disclosure on with neither option chosen is incomplete", () => {
    const d = draft({
      privacy: "PUBLIC_TO_EVERYONE",
      commercial: { enabled: true, yourBrand: false, brandedContent: false },
    });
    expect(tiktokDraftProblem(d)).toMatch(/commercial disclosure/);
  });

  it("branded content can't be private", () => {
    const d = draft({
      privacy: "SELF_ONLY",
      commercial: { enabled: true, yourBrand: false, brandedContent: true },
    });
    expect(tiktokDraftProblem(d)).toMatch(/can't be private/);
  });

  it("a complete draft becomes server options, omitting disclosure when off", () => {
    const o = tiktokOptionsFromDraft(
      draft({ privacy: "SELF_ONLY", allowComment: true }),
    );
    expect(o).toEqual({
      privacy: "SELF_ONLY",
      allowComment: true,
      allowDuet: false,
      allowStitch: false,
      commercial: undefined,
    });
  });

  it("own-brand disclosure on a private video is allowed", () => {
    const d = draft({
      privacy: "SELF_ONLY",
      commercial: { enabled: true, yourBrand: true, brandedContent: false },
    });
    expect(tiktokDraftProblem(d)).toBeNull();
  });
});

import { afterEach, vi } from "vitest";
import { publishToTikTok } from "@/lib/social/direct/tiktok";

describe("what is sent to TikTok", () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockTikTok() {
    let initBody: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        if (url.includes("creator_info")) {
          return new Response(
            JSON.stringify({
              data: {
                creator_nickname: "Brand",
                privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
                comment_disabled: false,
                duet_disabled: false,
                stitch_disabled: false,
              },
              error: { code: "ok" },
            }),
          );
        }
        initBody = JSON.parse(init?.body ?? "{}");
        return new Response(
          JSON.stringify({ data: { publish_id: "p1" }, error: { code: "ok" } }),
        );
      }),
    );
    return () => initBody as { post_info: Record<string, unknown> };
  }

  const base = {
    accessToken: "t",
    mediaUrl: "https://x/v.mp4",
    isVideo: true,
    caption: "hi",
  };

  it("sends the user's privacy, interaction and disclosure choices", async () => {
    const sent = mockTikTok();
    await publishToTikTok({
      ...base,
      options: {
        privacy: "PUBLIC_TO_EVERYONE",
        allowComment: true,
        allowDuet: false,
        allowStitch: true,
        commercial: { enabled: true, yourBrand: true, brandedContent: false },
      },
    });
    expect(sent().post_info).toMatchObject({
      privacy_level: "PUBLIC_TO_EVERYONE",
      disable_comment: false,
      disable_duet: true,
      disable_stitch: false,
      brand_organic_toggle: true,
      brand_content_toggle: false,
    });
  });

  it("sends no disclosure fields when it wasn't turned on", async () => {
    const sent = mockTikTok();
    await publishToTikTok({
      ...base,
      options: {
        privacy: "SELF_ONLY",
        allowComment: false,
        allowDuet: false,
        allowStitch: false,
      },
    });
    expect(sent().post_info).not.toHaveProperty("brand_content_toggle");
    expect(sent().post_info).not.toHaveProperty("brand_organic_toggle");
  });

  it("refuses private branded content before calling TikTok", async () => {
    mockTikTok();
    await expect(
      publishToTikTok({
        ...base,
        options: {
          privacy: "SELF_ONLY",
          allowComment: false,
          allowDuet: false,
          allowStitch: false,
          commercial: { enabled: true, yourBrand: false, brandedContent: true },
        },
      }),
    ).rejects.toThrow(/branded content/);
  });
});
