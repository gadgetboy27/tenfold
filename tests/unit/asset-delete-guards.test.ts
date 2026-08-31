import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Structural guards on the two routes the one-video checkpoint added.
 *
 * Read from source rather than mocked, for the same reason
 * credit-integrity.test.ts does: mocking the DB would only prove the mock
 * refused. What matters here is that the refusal is written down at all —
 * both guards are cheap to delete by accident while refactoring, and both
 * fail silently and permanently when they go.
 */

const DELETE_ROUTE = "app/api/assets/[id]/route.ts";
const PUBLISH_ROUTE = "app/api/publish/route.ts";
const CAMPAIGN_ROUTE = "app/api/campaigns/[id]/route.ts";
const MIGRATION = "db/migrations/0032_campaign_publish_pick.sql";

const read = (p: string) => readFileSync(p, "utf8");

describe("DELETE /api/assets/[id]", () => {
  const src = read(DELETE_ROUTE);

  it("exists and is workspace-scoped", () => {
    // withWorkspace is what stops one tenant deleting another's assets. A
    // hand-rolled handler here would bypass WORKSPACE_SCOPED_TABLES entirely.
    expect(src).toMatch(/export const DELETE = withWorkspace/);
  });

  it("refuses to delete the campaign's anchor image", () => {
    // Everything downstream — video, compositor, publish — derives from the
    // anchor. Deleting it strands the campaign with no way back.
    expect(src).toContain("anchor_asset_id");
    expect(src).toMatch(/status: 409/);
  });

  it("refuses to delete anything already published", () => {
    // Reddit posts kind=link at the public Storage URL and Pinterest pins the
    // same way (CLAUDE.md §7d) — deleting a published asset breaks a live post
    // on someone else's site, which no amount of local cleanup can undo.
    expect(src).toContain("publish_records");
    expect(src).toMatch(/published_at/);
  });

  it("removes the Storage object, not just the row", () => {
    // A row-only delete leaves the file paid for and orphaned in the bucket
    // forever, invisible to every listing that could find it again.
    expect(src).toMatch(/storage\s*\n?\s*\.from\("assets"\)\s*\n?\s*\.remove/);
  });

  it("tolerates a Storage object that is already gone", () => {
    // Otherwise a half-deleted asset can never be finished off: the row stays
    // listed, and every retry dies on the same missing file.
    expect(src).toMatch(/\.catch\(\(\) => undefined\)/);
  });
});

describe("the publish checkpoint", () => {
  const src = read(PUBLISH_ROUTE);

  it("refuses to guess between several videos", () => {
    expect(src).toContain("video_pick_required");
    expect(src).toContain("resolvePublishVideo");
  });

  it("answers ambiguity with 409, not a silent newest-wins", () => {
    const idx = src.indexOf("video_pick_required");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 400)).toMatch(/status: 409/);
  });

  it("keeps the per-platform mute working when a video is picked", () => {
    // LinkedIn and Pinterest start muted by platform default. A picked branded
    // export has the music bed burnt in, so honouring the pick blindly would
    // post sound to platforms the user explicitly silenced.
    expect(src).toMatch(/body\.noMusic && picked\.type !== "video"/);
  });

  it("moves the pick onto the re-muxed copy", () => {
    // The late-music remux writes a NEW asset row. Leaving publish_asset_id on
    // the old silent cut means every future publish re-muxes it again, and the
    // strip keeps highlighting a clip that is no longer what posts.
    const idx = src.indexOf("needsMusicRemux(picked.created_at");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 1400)).toMatch(/publish_asset_id: freshId/);
  });
});

describe("naming the pick", () => {
  it("verifies the asset is a video in THIS campaign before storing it", () => {
    // The FK only proves the asset exists. Without this check an id from
    // another campaign — or the anchor image — is accepted here and then goes
    // out to every connected network as "the video".
    const src = read(CAMPAIGN_ROUTE);
    const idx = src.indexOf("raw.publish_asset_id !== undefined");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1200);
    expect(block).toContain('.eq("campaign_id", id)');
    expect(block).toContain('.eq("workspace_id", session.workspaceId)');
    expect(block).toMatch(/composed_video/);
  });

  it("un-picks rather than cascades when the picked video is deleted", () => {
    // ON DELETE CASCADE here would delete the CAMPAIGN when its chosen clip is
    // binned — losing the images, the caption and every other asset with it.
    const sql = read(MIGRATION);
    expect(sql).toMatch(/on delete set null/i);
    expect(sql).not.toMatch(/publish_asset_id[\s\S]{0,120}on delete cascade/i);
  });
});
