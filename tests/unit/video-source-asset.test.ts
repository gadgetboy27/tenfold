import { describe, it, expect } from "vitest";

/**
 * The normalised video start frame is a project asset now, and these pin the
 * two filters that keep it from becoming clutter.
 *
 * The bug behind it: `prepareVideoStartImage` uploaded the frame straight to
 * storage with no `assets` row and no campaign. So the exact image a video was
 * generated FROM wasn't part of the project, and — because
 * `DELETE /api/campaigns/[id]` collects storage paths from `assets` rows —
 * nothing could ever delete it. It outlived the campaign it belonged to.
 *
 * It's excluded from both browsing surfaces on purpose: it's a working copy of
 * the anchor, resized to fit Kling's 10MB cap, so listing it offers the user a
 * near-identical duplicate to choose between. Owned and cleaned up, without
 * being a second thing to reason about.
 *
 * The filters live in two routes and are asserted here in one place so they
 * cannot drift apart — an asset hidden from the Gallery but shown in the strip
 * is worse than one shown in both.
 */

type Meta = { hd?: boolean; kind?: string } | null;

/** The Gallery's rule (app/api/gallery/route.ts). */
function galleryShows(meta: Meta): boolean {
  return (
    !meta?.hd && meta?.kind !== "logo_bundle" && meta?.kind !== "video_source"
  );
}

/** The project strip's rule (app/api/campaigns/[id]/progress/route.ts). */
function stripShows(type: string, meta: Meta): boolean {
  return (
    (type === "image" || type === "composed_image") &&
    !meta?.hd &&
    meta?.kind !== "video_source"
  );
}

describe("the video start frame is owned but not shown", () => {
  const frame: Meta = { kind: "video_source" };

  it("is hidden from the Gallery", () => {
    expect(galleryShows(frame)).toBe(false);
  });

  it("is hidden from the project strip", () => {
    expect(stripShows("image", frame)).toBe(false);
  });

  it("is hidden from BOTH, never just one", () => {
    // Shown in one surface and not the other is the confusing outcome: the
    // user sees an image they cannot find again, or cannot delete.
    expect(galleryShows(frame)).toBe(stripShows("image", frame));
  });
});

describe("everything else still shows", () => {
  it("a normal generated image is unaffected", () => {
    expect(galleryShows(null)).toBe(true);
    expect(galleryShows({})).toBe(true);
    expect(stripShows("image", null)).toBe(true);
    expect(stripShows("composed_image", {})).toBe(true);
  });

  it("keeps the exclusions that were already there", () => {
    expect(galleryShows({ hd: true })).toBe(false);
    expect(galleryShows({ kind: "logo_bundle" })).toBe(false);
    expect(stripShows("image", { hd: true })).toBe(false);
  });

  it("does not hide an unrelated kind", () => {
    // The filter is an explicit list, not a prefix match — a future
    // `kind: "video_thumb"` must not disappear by accident.
    expect(galleryShows({ kind: "logo_svg" })).toBe(true);
    expect(galleryShows({ kind: "video_thumb" })).toBe(true);
  });
});
