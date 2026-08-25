import type { LayerAnchor } from "@/lib/composition/layers";

/**
 * Tell the image model to leave room for words — without telling it the words.
 *
 * Placing type AFTER generation means stamping it onto whatever the model
 * happened to compose, which is why the Words tool needs a scrim so often: the
 * headline lands on a busy focal point and has to be rescued with a dark panel.
 *
 * Saying it up front is strictly better. The model composes around the gap —
 * clean negative space where the type will go — and the result looks designed
 * rather than covered up.
 *
 * The letters still never reach the model. It is told WHERE to leave room and
 * explicitly told to render no text at all, which also suppresses the garbage
 * lettering it invents unprompted ("AUNCEAAN FLEANCE" came from a brief that
 * never mentioned text).
 */

/** Plain-English description of the region to keep clear. */
const ZONE_PHRASE: Record<LayerAnchor, string> = {
  "top-left": "the upper-left area",
  top: "the upper third",
  "top-right": "the upper-right area",
  left: "the left third",
  center: "the middle of the frame",
  right: "the right third",
  "bottom-left": "the lower-left area",
  bottom: "the lower third",
  "bottom-right": "the lower-right area",
};

/**
 * Never rendering text is worth stating even when no wording is planned: image
 * models add invented signage, labels and watermarks to product and street
 * scenes unasked, and it is always wrong.
 */
export const NO_TEXT_INSTRUCTION =
  "Render NO text, letters, words, numbers, logos, signage, watermarks or " +
  "typography anywhere in the image.";

/**
 * Composition guidance for a generation that will carry an overlay.
 *
 * Returns null when there is nothing to reserve, so callers can append
 * unconditionally without building a sentence about nothing.
 */
export function reserveSpaceInstruction(zone: LayerAnchor | null): string | null {
  if (!zone) return null;
  return (
    `Compose so ${ZONE_PHRASE[zone]} stays visually quiet — simple background, ` +
    `low detail, no important subject matter there — because text will be ` +
    `overlaid in that area afterwards. ${NO_TEXT_INSTRUCTION}`
  );
}

/**
 * The guidance appended to every generated direction.
 *
 * Always suppresses text; adds the reservation only when a zone is chosen. Kept
 * separate from the user's own prompt so their wording is never rewritten — the
 * same boundary the Words tool draws.
 */
export function compositionGuidance(zone: LayerAnchor | null): string {
  return reserveSpaceInstruction(zone) ?? NO_TEXT_INSTRUCTION;
}
