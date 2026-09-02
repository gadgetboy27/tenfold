import { z } from "zod";
import { BRAND_FONTS } from "@/lib/composition/layers";

/**
 * What the ad watcher may say about a finished video.
 *
 * ── Why this is NOT wordTreatmentSchema ─────────────────────────────────
 *
 * `wordTreatmentSchema` deliberately has no field for letters, and a test
 * pins that: it is what stops an IMAGE model's invented spelling reaching the
 * canvas. This schema does carry copy, and that is not a loosening of the same
 * rule — it is a different pipeline with a different threat model.
 *
 *   Words tool:  letters must never reach an image model, because an image
 *                model asked for text produces "AUNCEAAN FLEANCE".
 *   Watcher:     Claude proposes copy, the COMPOSITOR renders it as a text
 *                layer with a real font file. No image model ever sees it.
 *
 * The Caption tool already has Claude writing copy for exactly this reason.
 * Keeping the two schemas apart is the point: someone editing the watcher
 * cannot accidentally widen the Words guarantee, and a test asserts that
 * wordTreatmentSchema still rejects a text field.
 */

/** The nine anchors, identical to LayerAnchor so a note maps to a real layer. */
export const noteZoneSchema = z.enum([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);

/** What kind of problem the watcher found. Drives grouping in the UI. */
export const noteKindSchema = z.enum([
  /** Nothing tells you what this is or why to care, early enough. */
  "hook",
  /** Text or logo unreadable — contrast, size, or a busy frame beneath it. */
  "legibility",
  /** Something sits where the platform draws its own UI over it. */
  "safe_area",
  /** No brand mark, or it arrives too late to be associated with the product. */
  "branding",
  /** Nothing asks the viewer to do anything. */
  "cta",
  /** Long stretch where nothing changes and attention leaks away. */
  "pacing",
]);

/**
 * A proposed overlay.
 *
 * Optional, because the most valuable note is often "this is wrong" with no
 * fix worth automating — a pacing problem cannot be solved by adding a banner,
 * and inventing one to have something to apply would be worse than silence.
 */
export const overlayProposalSchema = z.object({
  /** The exact words to render. The compositor spells these, not a model. */
  text: z.string().min(1).max(120),
  zone: noteZoneSchema,
  font: z.enum(BRAND_FONTS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Fraction of frame width the block should span. */
  widthFrac: z.number().min(0.2).max(0.9),
  /** A scrim behind the type when the frame underneath is busy. */
  scrim: z.boolean(),
});

export const adNoteSchema = z.object({
  kind: noteKindSchema,
  /** Where in the clip this was observed, so the user can go and look. */
  atSec: z.number().min(0),
  /** What is wrong, in one sentence, stated as an observation not a verdict. */
  observation: z.string().min(1).max(240),
  /** Why it costs the ad something — the reason a fix is worth making. */
  why: z.string().min(1).max(240),
  /** How sure the watcher is. Low-confidence notes are shown, never applied. */
  confidence: z.enum(["high", "medium", "low"]),
  overlay: overlayProposalSchema.optional(),
});

export type AdNote = z.infer<typeof adNoteSchema>;
export type OverlayProposal = z.infer<typeof overlayProposalSchema>;

export const adWatchResultSchema = z.object({
  /** One line on what the ad is doing well — a review that only criticises
   *  gets discounted wholesale, and the strength is often what to build on. */
  working: z.string().max(240),
  notes: z.array(adNoteSchema).max(6),
});

export type AdWatchResult = z.infer<typeof adWatchResultSchema>;

/**
 * The wording actually placed on the ad — yours if you gave one, the
 * watcher's otherwise.
 *
 * Two directions, because a proposal is a starting point and not a verdict:
 *
 *   BEFORE — pass `steer` into the review and the watcher is told to work
 *            your line in rather than invent its own. Useful when you already
 *            know the claim and want help placing and styling it.
 *   AFTER  — accept a note but override `text` at apply time. The placement,
 *            font, colour and scrim the model chose are usually the valuable
 *            part; the copy is the part a human most often wants to adjust.
 *
 * Style is kept separate from wording on purpose: editing the words must never
 * silently discard the layout judgement that came with them.
 */
export function resolveOverlayText(
  proposal: OverlayProposal,
  userText?: string | null,
): string {
  const edited = (userText ?? "").trim();
  return edited.length > 0 ? edited : proposal.text;
}

/**
 * Apply an edit to a proposal without losing its styling.
 *
 * Returns the same object when nothing was edited, so a caller can compare by
 * reference to tell "the user accepted this as-is" from "the user rewrote it"
 * — which is worth logging: a watcher whose copy is always rewritten is a
 * watcher whose copy needs work.
 */
export function withUserWording(
  proposal: OverlayProposal,
  userText?: string | null,
): OverlayProposal {
  const text = resolveOverlayText(proposal, userText);
  return text === proposal.text ? proposal : { ...proposal, text };
}

/**
 * An overlay proposal is shaped exactly like a WordTreatment minus the text,
 * so the existing, tested layer builder can place it.
 *
 * Deliberately a conversion rather than making the schemas share a type: the
 * Words schema must keep having NO text field (that is the guarantee), so the
 * two stay separate and this function is the one seam between them.
 */
export function overlayAsTreatment(p: OverlayProposal): {
  name: string;
  zone: OverlayProposal["zone"];
  font: OverlayProposal["font"];
  color: string;
  widthFrac: number;
  scrim: boolean;
} {
  return {
    name: "Review suggestion",
    zone: p.zone,
    font: p.font,
    color: p.color,
    widthFrac: p.widthFrac,
    scrim: p.scrim,
  };
}

/**
 * Only high-confidence notes carrying an overlay may be auto-applied.
 *
 * A medium-confidence guess stamped onto someone's ad is worse than no
 * feature: it costs a re-render, an approval round trip, and trust. The rest
 * still surface as reading.
 */
export function applicableNotes(result: AdWatchResult): AdNote[] {
  return result.notes.filter((n) => n.overlay && n.confidence === "high");
}
