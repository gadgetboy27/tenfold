import { describe, it, expect } from "vitest";
import {
  STUDIO_FLOW,
  STEP_ACTION,
  nextStep,
  remainingSteps,
  resumeSection,
  flowProgress,
  type DoneMap,
} from "@/lib/studio/flow";
import { RUN_STAGES } from "@/lib/foreman/plan";

/**
 * Resuming a project used to be a three-branch guess —
 * `anchor ? "video" : images ? "images" : "brief"` — so someone who had reached
 * Music came back to Video, while the progress map already fetched alongside it
 * knew exactly what was finished. And the "what next" panel offered the same
 * three suggestions forever, still saying "Make it move" to someone who had
 * made the video.
 *
 * Both now derive from one order. These pin that it stays derived.
 */

describe("the order of things", () => {
  it("starts at images and ends at publish", () => {
    // Publishing is the terminal act; anything after it isn't a step.
    expect(STUDIO_FLOW[0]).toBe("images");
    expect(STUDIO_FLOW[STUDIO_FLOW.length - 1]).toBe("publish");
  });

  it("has no duplicates", () => {
    // A repeated step would make nextStep return something already finished.
    expect(new Set(STUDIO_FLOW).size).toBe(STUDIO_FLOW.length);
  });

  it("labels every step it will ever suggest", () => {
    // A missing label falls back to the raw SectionId, which surfaces as
    // "compositor" in a button where a sentence should be.
    for (const step of STUDIO_FLOW) {
      expect(STEP_ACTION[step], `no label for ${step}`).toBeTruthy();
    }
  });

  it("stays separate from the foreman's plan", () => {
    // RUN_STAGES is the autopilot's plan: it stops at caption because
    // publishing must remain a human action, and knows nothing of Words or the
    // Compositor. Collapsing the two would either make the robot publish or
    // hide steps from the person.
    expect(RUN_STAGES).not.toContain("publish");
    expect(STUDIO_FLOW).toContain("publish");
    expect(STUDIO_FLOW).toContain("words");
    expect(RUN_STAGES).not.toContain("words");
  });

  it("excludes steps that can't sequence a single ad", () => {
    // logo is workspace-level (done.logo means "this workspace has a mark"),
    // projects is the way out, brief is the way in, and the Pro tools are
    // optional — putting any of them in the line would nag or mislead.
    for (const absent of ["logo", "projects", "brief", "tryon", "talking"]) {
      expect(STUDIO_FLOW).not.toContain(absent);
    }
  });
});

describe("nextStep", () => {
  it("returns the first unfinished step, not the first step", () => {
    const done: DoneMap = { images: true, words: true };
    expect(nextStep(done)).toBe("video");
  });

  it("skips ahead over anything already finished, in any order", () => {
    // Work doesn't happen in order — someone may caption before filming.
    const done: DoneMap = { images: true, words: true, video: true, music: true, caption: true };
    expect(nextStep(done)).toBe("compositor");
  });

  it("returns null when the ad is finished", () => {
    const done: DoneMap = Object.fromEntries(
      STUDIO_FLOW.map((s) => [s, true]),
    );
    expect(nextStep(done)).toBeNull();
  });

  it("starts at the beginning for a brand-new project", () => {
    expect(nextStep({})).toBe("images");
  });
});

describe("resumeSection", () => {
  it("returns to where they actually were", () => {
    // Even mid-way through a step they hadn't finished — "where I left off" is
    // what a person means, not "the next thing on the list".
    expect(resumeSection({ images: true }, "music")).toBe("music");
  });

  it("falls to the first unfinished step with no memory", () => {
    expect(resumeSection({ images: true, words: true }, null)).toBe("video");
  });

  it("ignores a remembered section that isn't part of the flow", () => {
    // The Gallery is a way out of a project; resuming onto it would land
    // someone on a list of OTHER projects.
    expect(resumeSection({ images: true }, "projects" as never)).toBe("words");
  });

  it("lands on publish rather than images when everything is done", () => {
    const done: DoneMap = Object.fromEntries(
      STUDIO_FLOW.map((s) => [s, true]),
    );
    // Sending a finished ad back to the start is the old heuristic's mistake
    // in the other direction.
    expect(resumeSection(done, null)).toBe("publish");
  });
});

describe("remainingSteps / flowProgress", () => {
  it("lists what's left, in order", () => {
    expect(remainingSteps({ images: true, video: true })).toEqual([
      "words",
      "music",
      "caption",
      "compositor",
      "publish",
    ]);
  });

  it("counts progress against the whole flow", () => {
    expect(flowProgress({ images: true, words: true })).toEqual({
      done: 2,
      total: STUDIO_FLOW.length,
    });
  });
});
