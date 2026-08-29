import { describe, it, expect } from "vitest";
import { needsMusicRemux, staleExports } from "@/lib/composition/late-music";

/**
 * FFmpeg muxes the music when it renders, so a composed_video is a permanent
 * snapshot of whatever audio existed at that moment. Publish reused any
 * existing export unconditionally — so generating the music after using the
 * Compositor produced a silent post, with nothing anywhere saying so.
 *
 * This is what lets Music sit late in STUDIO_FLOW instead of being pinned
 * ahead of the Compositor.
 */

const EXPORTED = "2026-08-25T10:00:00.000Z";

describe("needsMusicRemux", () => {
  it("catches music generated after the export", () => {
    expect(needsMusicRemux(EXPORTED, "2026-08-25T10:05:00.000Z")).toBe(true);
  });

  it("leaves an export that already carries the music alone", () => {
    // Re-muxing a correct export would burn an FFmpeg pass on every publish
    // and re-encode the video for nothing.
    expect(needsMusicRemux(EXPORTED, "2026-08-25T09:55:00.000Z")).toBe(false);
  });

  it("treats an identical timestamp as already carried", () => {
    // The export reads the newest audio asset at render time, so a track
    // written in the same instant is the one it used.
    expect(needsMusicRemux(EXPORTED, EXPORTED)).toBe(false);
  });

  it("does nothing when there is no music at all", () => {
    // A silent ad is a legitimate choice, not a defect to repair.
    expect(needsMusicRemux(EXPORTED, null)).toBe(false);
    expect(needsMusicRemux(EXPORTED, undefined)).toBe(false);
  });
});

describe("staleExports", () => {
  const exports = [
    { id: "9x16", created_at: "2026-08-25T10:00:00.000Z" },
    { id: "1x1", created_at: "2026-08-25T11:00:00.000Z" },
  ];

  it("checks every fan-out aspect, not just the newest", () => {
    // Each aspect is its own render, so a 9:16 cut made before the music is
    // exactly as silent as any other — and publishing picks between them
    // per platform.
    const stale = staleExports(exports, "2026-08-25T10:30:00.000Z");
    expect(stale.map((e) => e.id)).toEqual(["9x16"]);
  });

  it("returns nothing when the music predates every export", () => {
    expect(staleExports(exports, "2026-08-25T09:00:00.000Z")).toEqual([]);
  });

  it("returns nothing when there is no music", () => {
    expect(staleExports(exports, null)).toEqual([]);
  });
});
