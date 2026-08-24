import { describe, it, expect } from "vitest";
import { ASPECT_DESIGN } from "@/lib/composition/layers";
import { wrapText } from "@/lib/composition/brand-apply";

/**
 * "Add to ad" first shipped with a hardcoded `sizePx: 64` and no wrapping, so
 * a real 277-character social caption rendered as three enormous lines running
 * off both edges of the frame. A caption is body copy whose length varies
 * hugely — the wrap width has to scale with it, and the size has to follow the
 * wrap.
 *
 * These pin the sizing rule itself (mirrored from adBridge) rather than
 * reaching into the zustand store, so the arithmetic that keeps text inside
 * the frame can't drift unnoticed.
 */

const wrapCharsFor = (len: number) => (len > 180 ? 42 : len > 90 ? 32 : 26);
const sizeFor = (wrapChars: number, width: number) =>
  Math.round(width / (wrapChars * 0.83));

describe("caption fitting", () => {
  const W = ASPECT_DESIGN["1:1"].width;

  it("stays in step with the sizing brand-apply already uses", () => {
    // brand-apply pairs wrap 26 -> width/22 and wrap 32 -> width/26. Those two
    // points don't share one exact constant (they imply 0.846 and 0.813), so
    // this asserts we land within a pixel or two of each — close enough that
    // a caption and a brand tagline look like the same design system, without
    // pretending to an identity that isn't there.
    expect(Math.abs(sizeFor(26, W) - Math.round(W / 22))).toBeLessThanOrEqual(2);
    expect(Math.abs(sizeFor(32, W) - Math.round(W / 26))).toBeLessThanOrEqual(2);
  });

  it("shrinks as the caption grows, instead of a fixed 64px", () => {
    const short = sizeFor(wrapCharsFor(40), W);
    const medium = sizeFor(wrapCharsFor(120), W);
    const long = sizeFor(wrapCharsFor(277), W);

    expect(short).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(long);
    // The real caption that overflowed must now come out well under the old
    // hardcoded 64px.
    expect(long).toBeLessThan(64);
  });

  it("wraps a real caption so no line can overrun the frame", () => {
    const caption =
      "The kind of bowl that makes you forget it's raining. " +
      "Hot broth, neon glow, nowhere else you'd rather be right now. " +
      "There's something about steam rising in a cold room that feels like " +
      "the whole world slowed down for a second. Find your spot tonight.";

    const wrapChars = wrapCharsFor(caption.length);
    const lines = wrapText(caption, wrapChars).split("\n");

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      // wrapText only breaks BETWEEN words, so a single very long word can
      // still exceed the target — allow for that, but nothing more.
      expect(line.length).toBeLessThanOrEqual(wrapChars + 12);
    }

    // The block must physically fit: widest line, at ~0.5em per character for
    // a sans face, against the artboard width.
    const sizePx = sizeFor(wrapChars, W);
    const widest = Math.max(...lines.map((l) => l.length));
    expect(widest * sizePx * 0.5).toBeLessThan(W);
  });

  it("fits on the tall artboard too, where width is smallest", () => {
    const W916 = ASPECT_DESIGN["9:16"].width;
    const wrapChars = wrapCharsFor(277);
    const sizePx = sizeFor(wrapChars, W916);
    expect(wrapChars * sizePx * 0.5).toBeLessThan(W916);
  });
});
