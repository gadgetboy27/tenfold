import type { SectionId } from "@/components/studio/Studio";

/**
 * The order of things — one place, so nothing can disagree about what comes
 * next.
 *
 * There was no such place before. `openProject` guessed with a three-branch
 * heuristic (`anchor ? "video" : images ? "images" : "brief"`), so someone who
 * had got as far as Music and came back landed on Video — while the progress
 * map it had already fetched knew exactly what was finished. And the "What
 * would you like to do next?" panel offered the same three suggestions
 * regardless, still saying "Make it move" to someone who had already made the
 * video.
 *
 * `RUN_STAGES` (lib/foreman/plan.ts) is deliberately NOT reused: that is the
 * autopilot's plan, it stops at caption because publishing must stay a human
 * action, and it has no concept of Words, Logo or the Compositor. Two different
 * questions — "what will the robot do" and "what is left for you" — so two
 * lists, each honest about its own job.
 */

/** Steps that make up a finished ad, in the order they naturally happen. */
export const STUDIO_FLOW: readonly SectionId[] = [
  "images",
  "words",
  "video",
  "music",
  "caption",
  "compositor",
  "publish",
] as const;

/**
 * Steps deliberately absent from the flow, and why — so nobody "fixes" this by
 * adding them:
 *
 * - `brief`   — the way IN to images, not a step of its own.
 * - `projects`— the Gallery: a way to leave, not part of building this ad.
 * - `logo`    — workspace-level, not per-campaign (`done.logo` means "this
 *               workspace has a mark"), so it can't sequence a single ad.
 * - the four Pro tools — genuinely optional side quests; putting them in the
 *               line would nag every user to buy things they didn't ask for.
 */

/** Human label for a step, for "next up" prompts. */
export const STEP_ACTION: Partial<Record<SectionId, string>> = {
  images: "Pick your image",
  words: "Add your wording",
  video: "Make it move",
  music: "Add a soundtrack",
  caption: "Write a caption",
  compositor: "Polish the composition",
  publish: "Publish it",
};

export type DoneMap = Partial<Record<SectionId, boolean>>;

/**
 * The first step that isn't finished, or null when everything is.
 *
 * Derived rather than stored, which matters: a stored "current step" drifts the
 * moment anything changes outside the app — a job completing by webhook, a
 * sweep settling a stalled render, the user deleting an asset. The progress map
 * is computed from the campaign's own jobs and assets, so this answer is always
 * true even when the last thing that happened wasn't a click.
 */
export function nextStep(done: DoneMap): SectionId | null {
  return STUDIO_FLOW.find((step) => !done[step]) ?? null;
}

/** Everything still outstanding, in order — for a "what's left" list. */
export function remainingSteps(done: DoneMap): SectionId[] {
  return STUDIO_FLOW.filter((step) => !done[step]);
}

/**
 * Where to drop someone when they reopen a project.
 *
 * `lastVisited` wins when it's a real step, because "where I left off" is what
 * a person actually means — even mid-way through a step they hadn't finished.
 * Otherwise fall to the first unfinished step, and if the ad is complete, the
 * end of the line rather than the beginning.
 */
export function resumeSection(
  done: DoneMap,
  lastVisited?: SectionId | null,
): SectionId {
  if (lastVisited && STUDIO_FLOW.includes(lastVisited)) return lastVisited;
  return nextStep(done) ?? "publish";
}

/** How far through the flow this ad is, for a progress readout. */
export function flowProgress(done: DoneMap): { done: number; total: number } {
  return {
    done: STUDIO_FLOW.filter((s) => done[s]).length,
    total: STUDIO_FLOW.length,
  };
}
