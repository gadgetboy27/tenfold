import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolvePublishVideo,
  displayVideo,
  ambiguousVideoMessage,
  type CampaignVideo,
} from "@/lib/campaign/video-pick";

/**
 * Pinned against campaign 62cc89cd ("Stellar Launch"), 2026-08-31.
 *
 * It held 1 raw clip + 9 branded exports + 14 music takes. Nothing in the UI
 * could remove one, and every consumer — /api/publish, Studio's rehydrate,
 * the Productions page — independently resolved "the video" as whichever row
 * was newest. So exporting a variant to compare it silently changed what
 * would publish, and no screen said which of the ten was going out.
 */

const clip = (
  id: string,
  createdAt: string,
  type = "composed_video",
): CampaignVideo => ({
  id,
  url: `https://cdn.test/${id}.mp4`,
  type,
  createdAt,
});

// The real shape: a fortnight of re-renders, newest last in creation order.
const STELLAR_LAUNCH = [
  clip("raw", "2026-07-11T13:23:51Z", "video"),
  clip("exp-1", "2026-07-11T14:48:44Z"),
  clip("exp-2", "2026-07-11T14:50:55Z"),
  clip("exp-3", "2026-07-11T19:36:29Z"),
  clip("exp-4", "2026-07-11T20:06:09Z"),
  clip("exp-5", "2026-07-11T20:38:22Z"),
  clip("exp-6", "2026-07-11T22:58:44Z"),
  clip("exp-7", "2026-07-19T02:45:35Z"),
  clip("exp-8", "2026-07-19T05:38:28Z"),
  clip("exp-9", "2026-07-19T05:38:28Z"),
];

describe("resolvePublishVideo", () => {
  it("refuses to guess between Stellar Launch's ten videos", () => {
    const r = resolvePublishVideo(STELLAR_LAUNCH, null);
    expect(r.status).toBe("ambiguous");
    expect(r).toMatchObject({ count: 10 });
  });

  it("publishes the picked cut, not the newest one", () => {
    // exp-3 is four renders old. Picking it must beat exp-9 outright —
    // "newest" is precisely the heuristic this replaces.
    const r = resolvePublishVideo(STELLAR_LAUNCH, "exp-3");
    expect(r).toMatchObject({ status: "ok", chosen: true });
    if (r.status === "ok") expect(r.video.id).toBe("exp-3");
  });

  it("resolves a single video with no pick — existing campaigns keep working", () => {
    // The checkpoint must not force every one-video project to go and tick a
    // box before it can publish; there is nothing to be ambiguous about.
    const r = resolvePublishVideo([STELLAR_LAUNCH[0]], null);
    expect(r).toMatchObject({ status: "ok", chosen: false });
  });

  it("marks an unpicked single video as NOT chosen", () => {
    // `chosen` gates the one-file publish path. A video that merely happens to
    // be alone was not deliberately selected, so it keeps the per-aspect
    // fan-out rather than silently losing it.
    const r = resolvePublishVideo([STELLAR_LAUNCH[3]], null);
    if (r.status === "ok") expect(r.chosen).toBe(false);
  });

  it("treats a deleted pick as ambiguous again, never falling through to newest", () => {
    // The asset was removed between choosing it and hitting publish. Quietly
    // substituting the newest render is exactly the failure the pick exists to
    // prevent, so the ambiguity has to come back.
    const r = resolvePublishVideo(STELLAR_LAUNCH, "exp-deleted");
    expect(r.status).toBe("ambiguous");
  });

  it("reports no video rather than throwing", () => {
    expect(resolvePublishVideo([], null)).toEqual({ status: "none" });
    expect(resolvePublishVideo([], "anything")).toEqual({ status: "none" });
  });

  it("names the count in the message — the user needs to know how many", () => {
    expect(ambiguousVideoMessage(10)).toContain("10 videos");
  });
});

describe("displayVideo", () => {
  it("shows the pick, so the canvas matches what will publish", () => {
    expect(displayVideo(STELLAR_LAUNCH, "exp-2")?.id).toBe("exp-2");
  });

  it("never refuses — a screen must render something", () => {
    // Unlike publishing, ambiguity here has to resolve to a frame.
    expect(displayVideo(STELLAR_LAUNCH, null)).not.toBeNull();
  });

  it("prefers the branded export over a raw clip made the same instant", () => {
    // The publish mix writes composed_video alongside the raw clip; showing
    // the raw one loses every overlay and brand mark the user just applied.
    const same = "2026-08-01T00:00:00Z";
    const got = displayVideo(
      [clip("raw", same, "video"), clip("brand", same)],
      null,
    );
    expect(got?.id).toBe("brand");
  });

  it("returns null only when there is genuinely nothing", () => {
    expect(displayVideo([], "exp-1")).toBeNull();
  });
});

/**
 * Regression, 2026-09-01. Migration 0032 added a SECOND foreign key between
 * assets and campaigns (campaigns.publish_asset_id → assets.id). PostgREST
 * then could not resolve the bare `campaigns(name)` embed in /api/productions,
 * the query errored, the route discarded the error, and a workspace holding
 * nine finished videos was told it had none.
 *
 * Read from source: the failure was a query string, so that is what to pin.
 */
describe("productions embed survives the second FK", () => {
  const src = readFileSync("app/api/productions/route.ts", "utf8");

  it("names the FK explicitly rather than letting PostgREST guess", () => {
    // Scoped to the .select() call, not the whole file — the comment above it
    // quotes the broken form on purpose, and a file-wide match would fail on
    // the explanation of the bug rather than the bug.
    const select = src.slice(src.indexOf(".select("), src.indexOf(".in("));
    expect(select).toContain("campaigns!assets_campaign_id_fkey(name)");
    // The bare form is what broke. If it comes back, so does the bug.
    expect(select).not.toMatch(/[^!]campaigns\(name\)/);
  });

  it("surfaces a query error instead of returning an empty list", () => {
    // An empty productions list reads as "you have made nothing", which the
    // user cannot distinguish from a broken query — that is precisely why this
    // went unnoticed until someone opened the page.
    expect(src).toMatch(/const \{ data, error \}/);
    expect(src).toMatch(/status: 500/);
  });
});
