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

/**
 * Steps that make up a finished ad, in the order they naturally happen.
 *
 * Ordered so the ad LOOKS finished as early as possible. Music used to sit
 * between video and the composition work, which meant waiting out a second
 * generation before you could see your ad assembled at all — and music is the
 * most skippable thing here, since most social video autoplays muted.
 *
 * Two things decide this order, and neither is taste:
 *
 * - **Music must precede the final export, not the Compositor.** FFmpeg muxes
 *   the audio when it renders, so an export made before the music exists is
 *   permanently silent. That used to pin music ahead of the Compositor; publish
 *   now re-muxes a late track onto the export (`lib/composition/late-music.ts`),
 *   which is what frees it to move down here.
 * - **The caption is post copy, not artwork.** It rides as the post text
 *   (see `captionStyle: "none"` in app/api/publish/route.ts), so nothing
 *   downstream renders it and it belongs beside Publish. On-image lettering is
 *   the Words step, which is a different thing and stays up top.
 */
export const STUDIO_FLOW: readonly SectionId[] = [
  "images",
  "words",
  "video",
  "compositor",
  "caption",
  "music",
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

/**
 * The left rail's order, top to bottom.
 *
 * The nav used to be hand-ordered independently of STUDIO_FLOW, so the two
 * disagreed: the rail read Video → Music → Caption → Words → Compositor while
 * the flow said words → video → compositor → caption → music. A menu that
 * lists the steps in a different order from the one the product recommends is
 * just a second, contradictory instruction.
 *
 * The flow steps here are asserted (in tests) to appear in exactly STUDIO_FLOW
 * order, so the two cannot drift again. Everything after `publish` is
 * deliberately NOT part of the sequence:
 *
 * - `brief`  — the Gallery shortcut: the way in and out, so it sits on top.
 * - `logo`   — workspace-level setup, not a step of this ad.
 * - the four Pro add-ons — optional side quests, grouped at the bottom so the
 *   spine of the rail is the actual order of work.
 */
export const NAV_ORDER: readonly SectionId[] = [
  "brief",
  ...STUDIO_FLOW,
  "logo",
  "productshot",
  "tryon",
  "talking",
  "autocaption",
] as const;

/** Rank for sorting nav items; unknown ids sort to the end rather than vanish. */
export function navRank(id: SectionId): number {
  const i = NAV_ORDER.indexOf(id);
  return i === -1 ? NAV_ORDER.length : i;
}

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
