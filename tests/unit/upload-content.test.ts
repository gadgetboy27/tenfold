import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  assertRasterMatches,
  assertSafeSvg,
  IMAGE_TYPES,
} from "@/lib/uploads/content";

/**
 * Uploads used to be stored with the client's own content type. The bucket
 * is public and serves what it stored, so "logo.png" sent as image/svg+xml
 * with a scripted SVG body was a page we host that runs script.
 */
describe("upload content", () => {
  it("the type follows the extension, never the client", () => {
    expect(IMAGE_TYPES.png).toBe("image/png");
    expect(IMAGE_TYPES.jpg).toBe("image/jpeg");
  });

  it("refuses bytes that disagree with the name", async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: "#fff" },
    })
      .png()
      .toBuffer();
    await expect(assertRasterMatches(png, "png")).resolves.toBeUndefined();
    await expect(assertRasterMatches(png, "jpg")).rejects.toThrow(/JPG/);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await expect(assertRasterMatches(svg, "png")).rejects.toThrow();
  });

  it("refuses an SVG that scripts, handles events, or loads remotely", () => {
    const bad = [
      "<svg><script>alert(1)</script></svg>",
      '<svg onload="alert(1)"></svg>',
      '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
      '<svg><foreignObject><body onload="x"/></foreignObject></svg>',
      '<svg><image href="https://evil.example/track.png"/></svg>',
      // entity-obfuscated handler
      '<svg &#111;nload="alert(1)"></svg>',
      '<svg><set attributeName="onmouseover" to="alert(1)"/></svg>',
    ];
    for (const s of bad) expect(() => assertSafeSvg(s), s).toThrow();
  });

  it("accepts a plain vector mark", () => {
    const ok =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#123456"/><text>Brand &#169;</text></svg>';
    expect(() => assertSafeSvg(ok)).not.toThrow();
  });
});
