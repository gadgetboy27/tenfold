import { z } from "zod";
import { wrapText } from "./brand-apply";
import {
  ASPECT_DESIGN,
  BRAND_FONTS,
  resolveCenter,
  type CompositionAspect,
  type LayerAnchor,
  type TextLayer,
} from "./layers";
import { TEXT_LINE_HEIGHT } from "./render";

/**
 * The Words tool: exact wording, drawn by us.
 *
 * The whole point is that the letters never pass through an image model. A
 * hot-sauce brief that never mentioned text still came back with bottles
 * labelled "AUNCEAAN FLEANCE" — an image model treats words as texture, and
 * asking it nicely for specific letters is a request, not a constraint.
 *
 * So the division is: **AI designs, the compositor draws the words.** A
 * treatment describes how the type should look and where it should sit; the
 * letters come from the user and are rendered by the same code that draws
 * captions, against a real font file. "Only these letters" stops being
 * something we hope the model respects and becomes something it never had the
 * chance to break.
 */

/** The nine placement zones, in the order a person scans a frame. */
export const WORD_ZONES: { id: LayerAnchor; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top", label: "Top" },
  { id: "top-right", label: "Top right" },
  { id: "left", label: "Left" },
  { id: "center", label: "Centre" },
  { id: "right", label: "Right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom", label: "Bottom" },
  { id: "bottom-right", label: "Bottom right" },
];

/**
 * Size presets, expressed as the fraction of frame width the block spans.
 *
 * Not point sizes: the actual sizePx is derived from this AND the length of
 * the wording (see sizeForWords), so "Large" means large relative to the
 * frame rather than a number that overflows the moment someone types a longer
 * headline. It also survives an aspect change, which a fixed pixel size does
 * not.
 */
export const WORD_SIZES: { label: string; widthFrac: number }[] = [
  { label: "Small", widthFrac: 0.35 },
  { label: "Medium", widthFrac: 0.55 },
  { label: "Large", widthFrac: 0.75 },
  { label: "Full width", widthFrac: 0.9 },
];

/**
 * A styling proposal. Note what is ABSENT: the text itself. A treatment can
 * never carry letters, which is what stops a model's spelling reaching the
 * canvas even if it tries to send some.
 */
export const wordTreatmentSchema = z.object({
  /** Short human label for the choice, e.g. "Corner stamp". */
  name: z.string().min(1).max(40),
  zone: z.enum([
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
  ]),
  font: z.enum(BRAND_FONTS),
  /**
   * 400 or 700. Optional so every treatment Claude has ever proposed — and
   * every one saved before the Bold files existed — still parses, defaulting
   * to Regular exactly as it rendered then.
   */
  weight: z.union([z.literal(400), z.literal(700)]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Fraction of the frame width the block should occupy, 0.2–0.9. */
  widthFrac: z.number().min(0.2).max(0.9),
  /** Whether the type needs a scrim to stay legible over busy artwork. */
  scrim: z.boolean(),
  /** One line on why this suits the image — shown under the option. */
  rationale: z.string().max(120).optional(),
});

export type WordTreatment = z.infer<typeof wordTreatmentSchema>;

export const wordTreatmentsSchema = z.object({
  treatments: z.array(wordTreatmentSchema).min(1).max(6),
});

/** A sensible starting point before any AI is involved. */
export const DEFAULT_TREATMENT: WordTreatment = {
  name: "Clean bottom",
  zone: "bottom",
  font: "Inter",
  color: "#ffffff",
  widthFrac: 0.8,
  scrim: true,
};

/**
 * How wide a character is, as a fraction of the point size.
 *
 * This was 0.5, described as "conservative". It wasn't: measured against the
 * real faces in public/fonts, mixed-case Inter Regular averages ~0.55em, Bold
 * ~0.6, and an all-caps headline in a display face runs 0.65–0.7. So a block
 * sized to span 80% of the frame at 0.5 actually spanned 95–110% and ran off
 * both edges of a 1:1 or 9:16 ad — and, because the resize handles sit on the
 * block's edges, they were off the canvas too, and the block could not be
 * pulled back in. 0.62 covers bold mixed case with room; caps in a wide face
 * may still touch the outline pad, which the re-fit catches.
 *
 * ONE constant for sizing, the overflow check and the re-fit, so "will it
 * fit" and "what size makes it fit" can never disagree.
 */
export const CHAR_EM = 0.62;

/**
 * Longest line a headline should run before wrapping. A headline is not body
 * copy: three or four words a line reads as a headline, forty characters reads
 * as a sentence set too large. Lines the user broke themselves are kept.
 */
export const HEADLINE_WRAP_CHARS = 22;

/**
 * Wrap each over-long line, keeping every break the user typed.
 *
 * Balanced, not greedy: a 25-character line cut at 22 leaves one word
 * stranded on its own line ("…Pale" / "Ale"), which is the classic widow a
 * designer would never let stand. Work out how many lines the text needs,
 * then aim each at an equal share, so the two lines come out near-even.
 * Only whitespace changes — the letters are exactly what was typed.
 */
export function wrapHeadline(text: string): string {
  return text
    .split("\n")
    .map((raw) => {
      const line = raw.trim();
      if (line.length <= HEADLINE_WRAP_CHARS) return line;
      const lines = Math.ceil(line.length / HEADLINE_WRAP_CHARS);
      const longestWord = Math.max(...line.split(/\s+/).map((w) => w.length));
      const target = Math.max(Math.ceil(line.length / lines), longestWord);
      return wrapText(line, target);
    })
    .join("\n");
}

/**
 * Size the type so the longest line fits the treatment's width.
 *
 * Same reasoning as the caption fitting: a fixed pixel size cannot work when
 * the text is user-supplied and its length is unknown. Type that is slightly
 * small reads as a design choice; type that overflows reads as a bug.
 */
export function sizeForWords(
  text: string,
  widthFrac: number,
  aspect: CompositionAspect,
): number {
  const longest = Math.max(...text.split("\n").map((l) => l.trim().length), 1);
  const targetPx = ASPECT_DESIGN[aspect].width * widthFrac;
  const size = targetPx / (longest * CHAR_EM);
  // Clamp to the schema's own bounds so a very short or very long line can't
  // produce a layer the doc rejects.
  return Math.round(Math.min(400, Math.max(8, size)));
}

/**
 * Build the text layer for a treatment. Pure — no store, no network — so the
 * arithmetic that keeps type inside the frame is testable on its own.
 *
 * `id` is supplied by the caller rather than generated here: a Words layer is
 * edited repeatedly (retype, restyle, move) and must replace itself rather
 * than stack a new block on every change.
 */
export function buildWordsLayer(params: {
  id: string;
  text: string;
  treatment: WordTreatment;
  aspect: CompositionAspect;
}): TextLayer {
  // Wrapped so a long headline becomes a block, not one line that has to be
  // shrunk to fit; the wrap is what keeps the type readable on a phone.
  const text = wrapHeadline(params.text.trim().slice(0, 500));
  const { treatment } = params;
  const sizePx = sizeForWords(text, treatment.widthFrac, params.aspect);

  // The zone is a STARTING position, resolved once to a free-floating point.
  // This used to be an anchor-mode pos — right for a corner stamp that must
  // survive a 1:1 → 9:16 re-render, wrong for a block the user places by
  // hand: dragging an anchored layer only recomputes the margins of its
  // anchored edges, so a "bottom" block (centre-anchored on x) could only be
  // moved up and down. Since the panel stopped offering zones (2026-09-15)
  // the block is positioned on the stage, and a stage-positioned layer is a
  // fraction layer like every other thing you drag. A user who needs a
  // corner to hold across formats has the per-format overrides for that.
  const lines = text.split("\n");
  const halfW =
    (Math.max(...lines.map((l) => l.trim().length), 1) * sizePx * CHAR_EM) / 2;
  const halfH = (lines.length * sizePx * TEXT_LINE_HEIGHT) / 2;
  const start = resolveCenter(
    { mode: "anchor", anchor: treatment.zone, mx: 0.05, my: 0.05 },
    params.aspect,
    halfW,
    halfH,
  );
  const { width: W, height: H } = ASPECT_DESIGN[params.aspect];

  return {
    id: params.id,
    kind: "text",
    text,
    font: treatment.font,
    ...(treatment.weight ? { weight: treatment.weight } : {}),
    sizePx,
    color: treatment.color,
    align: "center",
    pos: { mode: "fraction", nx: start.x / W, ny: start.y / H },
    scale: 1,
    rotationDeg: 0,
    opacity: 1,
    blend: "normal",
    appearAt: 0,
    disappearAt: null,
    fadeSec: 0,
    ...(treatment.scrim
      ? { bg: { color: "#000000", opacity: 0.45, padPx: 20 } }
      : {}),
  };
}

/** How wide a text block renders, in design pixels — see CHAR_EM. */
function blockWidthPx(text: string, sizePx: number): number {
  const longest = Math.max(...text.split("\n").map((l) => l.trim().length), 1);
  return longest * sizePx * CHAR_EM;
}

/** Does this text layer run off the frame at its current size? */
export function textOverflows(
  layer: TextLayer,
  aspect: CompositionAspect,
): boolean {
  // 0.94 rather than 1.0: type touching the exact frame edge still reads as
  // broken, and anchored layers carry a margin of their own.
  return (
    blockWidthPx(layer.text, layer.sizePx) > ASPECT_DESIGN[aspect].width * 0.94
  );
}

/**
 * Shrink a text layer until it fits, and change nothing else.
 *
 * Deliberately does NOT re-wrap. Re-flowing the text would destroy line breaks
 * someone typed on purpose — a two-line headline becoming three because we
 * decided differently is a worse outcome than the size being slightly small.
 * Only sizePx moves, so the result is predictable and the wording is untouched.
 */
export function refitTextLayer(
  layer: TextLayer,
  aspect: CompositionAspect,
): TextLayer {
  if (!textOverflows(layer, aspect)) return layer;

  const width = ASPECT_DESIGN[aspect].width;

  // A single unbroken line has no line breaks to protect, so wrap it rather
  // than shrinking it into the floor. Shrink-only turned a 52-character
  // caption into 36px type on a 1080px frame — technically fitting, visibly
  // tiny, and the obvious answer was two lines at nearly double the size.
  //
  // Text that ALREADY has line breaks is left broken exactly as it is and only
  // shrunk: those breaks were somebody's decision, and re-flowing them is the
  // thing this deliberately won't do.
  const hasOwnBreaks = layer.text.includes("\n");

  if (!hasOwnBreaks) {
    const wrapChars =
      layer.text.length > 180 ? 42 : layer.text.length > 90 ? 32 : 26;
    const wrapped = wrapText(layer.text, wrapChars);
    const longest = Math.max(
      ...wrapped.split("\n").map((l) => l.trim().length),
      1,
    );
    return {
      ...layer,
      text: wrapped,
      sizePx: Math.round(
        Math.min(400, Math.max(8, (width * 0.92) / (longest * CHAR_EM))),
      ),
    };
  }

  const longest = Math.max(
    ...layer.text.split("\n").map((l) => l.trim().length),
    1,
  );
  // 0.92 sits just under textOverflows' 0.94, so a re-fit always clears the
  // check without shrinking further than it has to.
  const target = (width * 0.92) / (longest * CHAR_EM);
  return {
    ...layer,
    // Clamped to the schema's own bounds, or the re-fit produces a layer the
    // document rejects — which would lose the text entirely rather than
    // shrink it.
    sizePx: Math.round(Math.min(400, Math.max(8, target))),
  };
}
