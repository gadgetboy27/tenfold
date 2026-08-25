import { describe, it, expect } from "vitest";
import {
  refitTextLayer,
  textOverflows,
  buildWordsLayer,
  DEFAULT_TREATMENT,
} from "@/lib/composition/words";
import { ASPECT_DESIGN, layerSchema } from "@/lib/composition/layers";
import type { TextLayer } from "@/lib/composition/layers";

/**
 * Text created before the sizing rules keeps its old size and runs off the
 * frame. Re-fitting is user-triggered rather than automatic: silently
 * rewriting someone's saved composition on load, because we now disagree with
 * its sizing, is worse than leaving it visibly wrong.
 *
 * The rule is shrink-to-fit and change nothing else. Re-flowing the text would
 * destroy line breaks someone typed on purpose.
 */

/** A layer in the state the old code produced: 64px, unwrapped. */
function legacyCaption(text: string): TextLayer {
  return {
    id: "caption",
    kind: "text",
    text,
    font: "Inter",
    sizePx: 64,
    color: "#ffffff",
    align: "center",
    pos: { mode: "fraction", nx: 0.5, ny: 0.84 },
    scale: 1,
    rotationDeg: 0,
    opacity: 1,
    blend: "normal",
    appearAt: 0,
    disappearAt: null,
    fadeSec: 0,
  };
}

const LONG =
  "The kind of bowl that makes you forget it's raining. Hot broth, neon glow.";

describe("textOverflows", () => {
  it("catches the real layer that overflowed on Neon Launch", () => {
    expect(textOverflows(legacyCaption(LONG), "1:1")).toBe(true);
  });

  it("leaves text that already fits alone", () => {
    const fitted = buildWordsLayer({
      id: "words",
      text: "Launch Week",
      treatment: DEFAULT_TREATMENT,
      aspect: "1:1",
    });
    expect(textOverflows(fitted, "1:1")).toBe(false);
  });

  it("judges against the frame it's actually in", () => {
    // 9:16 is much narrower than 16:9, so the same block can fit one and not
    // the other — checking against a fixed width would be wrong on two thirds
    // of the aspects.
    // Chosen to straddle the two: 42 chars at 64px is ~1344 design px, which
    // busts 9:16's ~1015px budget and sits well inside 16:9's ~1804px. The
    // first attempt here used a 31-char string that fits BOTH — the assertion
    // was wrong, not the code.
    const layer = legacyCaption("A reasonably long headline that keeps going");
    expect(textOverflows(layer, "9:16")).toBe(true);
    expect(textOverflows(layer, "16:9")).toBe(false);
  });
});

describe("refitTextLayer", () => {
  it("wraps an unbroken line rather than shrinking it into the floor", () => {
    // The reported problem: shrink-only turned a 52-character caption into
    // ~36px type on a 1080px frame. Technically fitting, visibly tiny, when
    // the obvious answer was two lines at nearly double the size. A single
    // line has no breaks to protect, so wrapping it is free.
    const before = legacyCaption(LONG);
    const after = refitTextLayer(before, "1:1");

    expect(textOverflows(after, "1:1")).toBe(false);
    expect(after.text.split("\n").length).toBeGreaterThan(1);
    // Bigger than it started, not smaller — that is the whole point.
    expect(after.sizePx).toBeGreaterThan(before.sizePx);
    // Wrapping only inserts line breaks; the words themselves are untouched.
    expect(after.text.replace(/\n/g, " ")).toBe(before.text);
  });

  it("never touches the wording or the line breaks", () => {
    // The whole reason this shrinks instead of re-wrapping: a two-line headline
    // silently becoming three is a worse outcome than slightly smaller type.
    const before = legacyCaption("Two deliberate\nlines of copy that overflow badly");
    const after = refitTextLayer(before, "9:16");

    expect(after.text).toBe(before.text);
    expect(after.text.split("\n")).toHaveLength(2);
  });

  it("changes nothing but the size when line breaks must be preserved", () => {
    const before = legacyCaption("Two deliberate\nlines of copy that overflow badly");
    const after = refitTextLayer(before, "9:16");

    expect({ ...after, sizePx: 0 }).toEqual({ ...before, sizePx: 0 });
    expect(after.sizePx).toBeLessThan(before.sizePx);
  });

  it("returns the layer untouched when it already fits", () => {
    // So the caller can compare sizePx and report a truthful count rather than
    // claiming it fixed something.
    const ok = legacyCaption("Short");
    expect(refitTextLayer(ok, "16:9")).toBe(ok);
  });

  it("stays inside the schema's size bounds", () => {
    // One enormous unbroken word would otherwise compute a size below the
    // minimum, producing a layer the document rejects — losing the text
    // entirely instead of shrinking it. (400 chars, not 600: the layer schema
    // caps text at 500, so a longer fixture would be invalid before refitting
    // and would test nothing.)
    const extreme = legacyCaption("x".repeat(400));
    const after = refitTextLayer(extreme, "9:16");
    expect(after.sizePx).toBeGreaterThanOrEqual(8);
    expect(layerSchema.safeParse(after).success).toBe(true);
  });

  it("clamps rather than lying when nothing can fit", () => {
    // A single 400-character word cannot fit any frame at the minimum size,
    // and this deliberately does not re-wrap to rescue it. The honest outcome
    // is a valid layer at the floor — not a layer the document rejects, and
    // not a silent re-flow of someone's text.
    const impossible = legacyCaption("x".repeat(400));
    const after = refitTextLayer(impossible, "9:16");
    expect(after.sizePx).toBe(8);
    expect(textOverflows(after, "9:16")).toBe(true);
    expect(after.text).toBe(impossible.text);
  });

  it("fits at every aspect", () => {
    for (const aspect of ["1:1", "9:16", "16:9"] as const) {
      const after = refitTextLayer(legacyCaption(LONG), aspect);
      expect(textOverflows(after, aspect), `overflowed at ${aspect}`).toBe(
        false,
      );
      // Measure the widest LINE, not the whole string — the string is wrapped
      // now, so measuring it whole would test a line that never renders.
      const widest = Math.max(
        ...after.text.split("\n").map((l) => l.trim().length),
      );
      expect(widest * after.sizePx * 0.5).toBeLessThan(
        ASPECT_DESIGN[aspect].width,
      );
    }
  });
});
