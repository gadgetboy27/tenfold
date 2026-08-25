import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * The `assets` bucket enforces allowed_mime_types. Anything the webhook can
 * produce and the bucket won't accept is rejected at upload — and until the
 * upload result was checked, that produced an asset ROW pointing at an object
 * that was never written. The branding screen then 404'd with NoSuchKey while
 * every other surface believed the logo existed.
 *
 * That happened twice on the same bucket: once with audio (fal serves music as
 * application/octet-stream, worked around by widening the list) and once with
 * SVG. The pattern is the failure mode, not the individual mime type — so this
 * pins the content types the webhook can emit against what the bucket allows.
 *
 * If you add a model that returns a new type, this fails BEFORE production
 * does. Widen the bucket in the same change.
 */

/** The bucket's allowed_mime_types, as configured in production. */
const BUCKET_ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "application/octet-stream",
  "image/svg+xml",
];

describe("every content type the webhook can store is accepted", () => {
  it("covers the extensions the fal webhook derives", () => {
    const src = readFileSync("app/api/webhooks/fal/route.ts", "utf8");

    // The webhook branches on content type to pick an extension: svg, png,
    // else jpg. Each of those must be storable or the row dangles.
    expect(src).toMatch(/includes\("svg"\)/);
    expect(BUCKET_ALLOWED).toContain("image/svg+xml");
    expect(BUCKET_ALLOWED).toContain("image/png");
    expect(BUCKET_ALLOWED).toContain("image/jpeg");
  });

  it("still covers video and audio, which came through the same path", () => {
    expect(BUCKET_ALLOWED).toContain("video/mp4");
    // fal serves music as octet-stream — the earlier instance of this same bug.
    expect(BUCKET_ALLOWED).toContain("application/octet-stream");
  });

  it("checks the upload result instead of assuming it worked", () => {
    const src = readFileSync("app/api/webhooks/fal/route.ts", "utf8");
    // A discarded upload result is precisely how a dangling asset row is
    // created: rejected by the bucket, recorded as success.
    expect(src).toMatch(/const \{ error: upErr \}[\s\S]{0,200}?\.upload\(/);
    expect(src).toMatch(/if \(upErr\)/);
  });

  it("webp is storable — Recraft returns it for raster logo concepts", () => {
    // The concepts grid is webp; a missing entry here would break the picker
    // the same way it broke the finalized SVG.
    expect(BUCKET_ALLOWED).toContain("image/webp");
  });
});
