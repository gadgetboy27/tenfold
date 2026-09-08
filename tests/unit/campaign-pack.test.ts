import { describe, it, expect } from "vitest";

/**
 * The campaign pack — everything a campaign made, in one zip.
 *
 * The product could publish and it could render, and between those two there
 * was no way to simply KEEP the work. "Send it to my web designer", "upload it
 * somewhere else later" all had the same answer: right-click each asset in
 * turn and hope you got them all.
 *
 * These pin the two decisions that make the zip usable rather than a bag of
 * uuids: the folder split, and the extension.
 */

/** Mirrors app/api/campaigns/[id]/pack/route.ts. */
function folderFor(type: string, branded: boolean): string {
  if (type === "audio") return "audio";
  if (type === "video" || type === "composed_video")
    return branded ? "finished/video" : "source/clips";
  return branded ? "finished/images" : "source/images";
}

function extFor(type: string, url: string): string {
  const fromUrl = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (fromUrl && fromUrl.length <= 4) return fromUrl;
  if (type === "audio") return "mp3";
  if (type.includes("video")) return "mp4";
  return "png";
}

describe("the zip explains itself", () => {
  it("separates what's finished from what it was built from", () => {
    // The distinction the recipient actually needs: which of these do I post,
    // and which are the raw materials? A flat folder makes them guess.
    expect(folderFor("composed_video", true)).toBe("finished/video");
    expect(folderFor("composed_image", true)).toBe("finished/images");
    expect(folderFor("video", false)).toBe("source/clips");
    expect(folderFor("image", false)).toBe("source/images");
  });

  it("keeps audio out of both — it is neither a render nor a still", () => {
    expect(folderFor("audio", false)).toBe("audio");
    expect(folderFor("audio", true)).toBe("audio");
  });

  it("puts an unknown type somewhere sane rather than dropping it", () => {
    // A type we don't recognise is still a file the user paid for.
    expect(folderFor("something_new", false)).toBe("source/images");
  });
});

describe("extensions", () => {
  it("takes the real extension from the URL when there is one", () => {
    expect(extFor("image", "https://x.test/a/b.svg")).toBe("svg");
    expect(extFor("composed_video", "https://x.test/a/b.mp4")).toBe("mp4");
    expect(extFor("image", "https://x.test/a/b.jpg")).toBe("jpg");
  });

  it("ignores a query string", () => {
    // Signed or cache-busted URLs would otherwise produce "png?width=200".
    expect(extFor("image", "https://x.test/a/b.png?width=200")).toBe("png");
  });

  it("falls back by type when the URL has no usable extension", () => {
    expect(extFor("audio", "https://x.test/track")).toBe("mp3");
    expect(extFor("composed_video", "https://x.test/clip")).toBe("mp4");
    expect(extFor("image", "https://x.test/still")).toBe("png");
  });

  it("does not mistake a long path segment for an extension", () => {
    // "…/a/verylongsegment" must not become a .verylongsegment file.
    expect(extFor("image", "https://x.test/a/verylongsegment")).toBe("png");
  });
});
