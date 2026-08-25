import { z } from "zod";
import {
  ASPECT_DESIGN,
  BRAND_FONTS,
  type CompositionAspect,
  type LayerAnchor,
  type TextLayer,
} from "./layers";

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
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/),
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
 * Size the type so the longest line fits the treatment's width.
 *
 * Same reasoning as the caption fitting: a fixed pixel size cannot work when
 * the text is user-supplied and its length is unknown. ~0.5em per character is
 * the usual approximation for a sans face — deliberately conservative, because
 * type that is slightly small reads as a design choice and type that overflows
 * reads as a bug.
 */
export function sizeForWords(
  text: string,
  widthFrac: number,
  aspect: CompositionAspect,
): number {
  const longest = Math.max(
    ...text.split("\n").map((l) => l.trim().length),
    1,
  );
  const targetPx = ASPECT_DESIGN[aspect].width * widthFrac;
  const size = targetPx / (longest * 0.5);
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
  const text = params.text.trim().slice(0, 500);
  const { treatment } = params;

  return {
    id: params.id,
    kind: "text",
    text,
    font: treatment.font,
    sizePx: sizeForWords(text, treatment.widthFrac, params.aspect),
    color: treatment.color,
    align: "center",
    // Anchor, not fraction: a corner stamp must stay in its corner at every
    // aspect ratio, which is exactly what anchor mode exists for.
    pos: { mode: "anchor", anchor: treatment.zone, mx: 0.05, my: 0.05 },
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
