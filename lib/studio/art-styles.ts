/**
 * Art style presets — shared between the styled-image generator (AddImageCard,
 * Wording) and the video creative-direction quick-fills (VideoInputs).
 *
 * These describe the RENDERING style of the artwork (anime, pencil, cartoon,
 * 3D, graffiti…) as opposed to VIDEO_STYLE_PROMPTS (lib/fal/prompts.ts), which
 * describe pacing/camera work (Cinematic, Fast-cut, Dramatic, Smooth). The two
 * are deliberately not merged into one list — Kling animates whatever image it
 * is given and substantially preserves that image's own visual character, so
 * asking an already-photoreal anchor to become "anime" at video-generation
 * time is not reliable the way a pacing choice is. The one dependable way to
 * get an anime/cartoon/pencil/3D-styled VIDEO is to style the ANCHOR IMAGE
 * with one of these first, then generate video from that styled anchor — the
 * style carries through because Kling is animating an already-styled picture.
 * `directionHint` exists for the (weaker, not guaranteed) case of nudging the
 * video prompt anyway, for someone who wants to try it on an existing anchor
 * without regenerating it.
 */
export interface ArtStyle {
  id: string;
  label: string;
  /** Appended to an image-generation prompt. */
  promptSuffix: string;
  /** A short phrase suited to the video "creative direction" free-text field. */
  directionHint: string;
}

export const ART_STYLES: ArtStyle[] = [
  {
    id: "anime",
    label: "Anime",
    promptSuffix:
      "in vibrant anime art style, clean bold linework, cel-shaded colour, Japanese animation aesthetic",
    directionHint: "reimagine the scene in a vibrant anime art style",
  },
  {
    id: "pencil",
    label: "Pencil drawing",
    promptSuffix:
      "as a detailed pencil sketch, graphite shading, visible paper texture, hand-drawn linework",
    directionHint: "give it a hand-drawn pencil-sketch look",
  },
  {
    id: "cartoon",
    label: "Cartoon",
    promptSuffix:
      "in a bold cartoon illustration style, clean thick outlines, flat saturated colour, playful proportions",
    directionHint: "make it feel like a bold cartoon illustration",
  },
  {
    id: "3d",
    label: "3D render",
    promptSuffix:
      "as a polished 3D rendered illustration, soft studio lighting, smooth materials, modern CGI look",
    directionHint: "give it a polished 3D-rendered CGI look",
  },
  {
    id: "graffiti",
    label: "Graffiti",
    promptSuffix:
      "graffiti street-art style, bold spray-paint lettering and texture, urban wall aesthetic",
    directionHint: "give it a graffiti / street-art spray-paint feel",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    promptSuffix:
      "as a soft watercolor painting, visible brushstrokes, gentle colour bleed, textured paper",
    directionHint: "give it a soft watercolor-painting feel",
  },
  {
    id: "oil",
    label: "Oil painting",
    promptSuffix:
      "as a rich oil painting, visible brushwork, classical painterly texture and depth",
    directionHint: "give it a rich, painterly oil-painting feel",
  },
];

/** Compose a base prompt with a style, or return it unchanged for "None". */
export function applyArtStyle(prompt: string, styleId: string | null): string {
  const style = ART_STYLES.find((s) => s.id === styleId);
  if (!style || !prompt.trim()) return prompt;
  return `${prompt.trim()}, ${style.promptSuffix}`;
}
