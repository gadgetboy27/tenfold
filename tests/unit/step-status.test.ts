import { describe, it, expect } from "vitest";
import {
  STUDIO_FLOW,
  STEP_ACTION,
  remainingSteps,
  type DoneMap,
} from "@/lib/studio/flow";

/**
 * Reopening a finished project landed someone on a step that was already done,
 * showed a live-looking control panel, and said nothing about either fact. The
 * controls configure the NEXT render, so changing them did nothing visible —
 * and there was no route onward, because the "what next" prompt existed only on
 * the Images step.
 *
 * These pin the two derivations StepStatus depends on: that a done step always
 * has somewhere to send you, and that the suggestions never point at the step
 * you're standing on.
 */

/** What StepStatus offers, minus the always-present Publish button. */
function suggestionsFor(section: string, done: DoneMap): string[] {
  return remainingSteps(done)
    .filter((s) => s !== section && s !== "publish")
    .slice(0, 2);
}

describe("a finished step always has somewhere to go", () => {
  it("never suggests the step you're already on", () => {
    // The bug this guards: standing on Video with a video made, being offered
    // "Make it move".
    const done: DoneMap = { images: true, video: true };
    expect(suggestionsFor("video", done)).not.toContain("video");
  });

  it("offers the real remaining work, in flow order", () => {
    const done: DoneMap = { images: true, video: true };
    expect(suggestionsFor("video", done)).toEqual(["words", "compositor"]);
  });

  it("falls back to Publish alone when nothing else is left", () => {
    // Publish is rendered unconditionally, so an empty suggestion list is a
    // valid end state rather than a dead end.
    const done: DoneMap = Object.fromEntries(
      STUDIO_FLOW.filter((s) => s !== "publish").map((s) => [s, true]),
    );
    expect(suggestionsFor("compositor", done)).toEqual([]);
    expect(remainingSteps(done)).toEqual(["publish"]);
  });

  it("labels every step it can suggest", () => {
    // A missing label would render the raw SectionId in a button.
    for (const step of STUDIO_FLOW) {
      expect(STEP_ACTION[step], `no label for ${step}`).toBeTruthy();
    }
  });
});
