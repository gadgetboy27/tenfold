import { describe, it, expect } from "vitest";
import { thumbUrl } from "@/lib/images/thumb";

const SUPA =
  "https://gbccfqpmoteicpumhkuj.supabase.co/storage/v1/object/public/assets/ws/camp/img.jpg";

describe("thumbUrl", () => {
  it("rewrites a Supabase object URL to the resizing endpoint", () => {
    const t = thumbUrl(SUPA, { width: 400, quality: 70 });
    expect(t).toContain("/storage/v1/render/image/public/");
    expect(t).not.toContain("/storage/v1/object/public/");
    expect(t).toContain("width=400");
    expect(t).toContain("quality=70");
  });

  it("works on the custom auth domain too", () => {
    // New assets are written with auth.prettymuch.nz since the custom domain
    // was activated; both hosts serve storage and both must resize.
    const custom = SUPA.replace(
      "gbccfqpmoteicpumhkuj.supabase.co",
      "auth.prettymuch.nz",
    );
    expect(thumbUrl(custom)).toContain("/render/image/public/");
  });

  it("leaves non-Supabase URLs alone", () => {
    // fal CDN links and anything external have no resizing endpoint; rewriting
    // them would produce a 404 where a working image used to be.
    const fal = "https://v3.fal.media/files/abc/output.png";
    expect(thumbUrl(fal)).toBe(fal);
  });

  it("preserves an existing query string", () => {
    const t = thumbUrl(`${SUPA}?token=abc`, { width: 200 });
    expect(t).toContain("token=abc");
    expect(t).toContain("width=200");
  });

  it("never returns undefined or throws on empty input", () => {
    expect(thumbUrl(null)).toBe("");
    expect(thumbUrl(undefined)).toBe("");
    expect(thumbUrl("")).toBe("");
  });

  it("defaults to a size that is small but still sharp", () => {
    const t = thumbUrl(SUPA);
    expect(t).toContain("width=400");
  });
});
