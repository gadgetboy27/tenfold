import { describe, it, expect } from "vitest";
import {
  CAPTION_PRESETS,
  captionPresetLayer,
  isProCaptionStyle,
  type CaptionStyle,
} from "@/lib/composition/caption-presets";
import { layerSchema } from "@/lib/composition/layers";
import { CAPTION_PRESETS as SERVER_PRESETS } from "@/lib/composition/video";

const ALL: CaptionStyle[] = ["none", "fade", "lower_third", "crawl"];

describe("caption preset registry", () => {
  it("is the same list the server renders from", () => {
    // Step 4 used to keep a hand-copied mirror of this list because video.ts
    // imports node:child_process. Same object now — they cannot drift.
    expect(SERVER_PRESETS).toBe(CAPTION_PRESETS);
  });

  it("keeps the elaborate styles behind Pro", () => {
    expect(isProCaptionStyle("none")).toBe(false);
    expect(isProCaptionStyle("fade")).toBe(false);
    expect(isProCaptionStyle("lower_third")).toBe(true);
    expect(isProCaptionStyle("crawl")).toBe(true);
  });
});

describe("caption preset → compositor layer", () => {
  const make = (style: CaptionStyle) =>
    captionPresetLayer(style, {
      text: "your barista didn't just make a coffee, they made you stare",
      aspect: "9:16",
      clipDurationSec: 10,
    });

  it("produces a layer the compositor schema accepts", () => {
    // These layers are hand-written and get persisted to compositions.layers
    // jsonb — if a preset emits an effect kind or pos mode the schema rejects,
    // the compositor would fail to reload the doc it just saved.
    for (const style of ALL) {
      const layer = make(style);
      if (!layer) continue;
      expect(() => layerSchema.parse(layer)).not.toThrow();
    }
  });

  it("places no layer for `none`, or when there is no caption", () => {
    expect(make("none")).toBeNull();
    expect(
      captionPresetLayer("fade", {
        text: "   ",
        aspect: "9:16",
        clipDurationSec: 10,
      }),
    ).toBeNull();
  });

  it("gives fade and lower_third the scrim they need to stay readable", () => {
    // The whole reason the text layer grew `bg`: white text vanishes on bright
    // footage, which is why drawtext always drew box=1 for these two.
    const fade = make("fade");
    const lower = make("lower_third");
    expect(fade).toMatchObject({ bg: { color: "#000000", opacity: 0.45 } });
    expect(lower).toMatchObject({ bg: { color: "#000000", opacity: 0.55 } });
  });

  it("mirrors the FFmpeg presets' distinguishing traits", () => {
    // lower_third is a LEFT-aligned bar (drawtext x=h/20), not centred.
    expect(make("lower_third")).toMatchObject({ align: "left" });
    // crawl is cinema yellow (0xFFE81F) with no scrim behind it.
    const crawl = make("crawl");
    expect(crawl).toMatchObject({ color: "#ffe81f" });
    expect(crawl && "bg" in crawl ? crawl.bg : undefined).toBeUndefined();
  });

  it("keeps the crawl moving across the whole clip", () => {
    // Enter from below + exit past the top, each over half the clip — the
    // sweep drawtext does with y=h-(h+th)*t/dur. If either half were a fixed
    // duration the text would arrive early and sit still.
    const crawl = make("crawl");
    expect(crawl?.effects?.in).toMatchObject({ kind: "slide-bottom" });
    expect(crawl?.effects?.out).toMatchObject({ kind: "slide-top" });
    expect(crawl?.effects?.in.durationSec).toBe(5);
  });

  it("clamps effect durations to what the schema allows", () => {
    // effects durationSec maxes out at 5s; a 60s clip must not emit 30.
    const long = captionPresetLayer("crawl", {
      text: "epic",
      aspect: "16:9",
      clipDurationSec: 60,
    });
    expect(long?.effects?.in.durationSec).toBe(5);
    expect(() => layerSchema.parse(long)).not.toThrow();
  });
});
