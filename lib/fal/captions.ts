// Auto-captions: fal-ai/auto-caption — transcribes a video's audio and burns in
// styled subtitles. Single video→video job, so it reuses the existing
// /api/webhooks/fal handler; only the submit route is dedicated.
// NOTE: it captions the SPOKEN audio, so it's meant for videos with speech
// (e.g. the talking-spokesperson video), not silent anchor clips.

export const AUTO_CAPTION_MODEL = "fal-ai/auto-caption";

export type CaptionColor = "white" | "yellow" | "black";
export type CaptionPosition = "bottom" | "middle";

export interface CaptionColorOption {
  id: CaptionColor;
  label: string;
  hex: string;
}

export const CAPTION_COLORS: CaptionColorOption[] = [
  { id: "white", label: "White", hex: "white" },
  { id: "yellow", label: "Yellow", hex: "#FFE81F" },
  { id: "black", label: "Black", hex: "black" },
];

/** Build the fal input for {@link AUTO_CAPTION_MODEL}. */
export function captionInput(p: {
  videoUrl: string;
  color: CaptionColor;
  fontSize: number;
  position: CaptionPosition;
  upper: boolean;
}): Record<string, unknown> {
  const hex = CAPTION_COLORS.find((c) => c.id === p.color)?.hex ?? "white";
  return {
    video_url: p.videoUrl,
    txt_color: hex,
    font_size: p.fontSize,
    stroke_width: 2,
    // 0.0 = top, 1.0 = bottom. Keep captions safely on-screen.
    top_align: p.position === "bottom" ? 0.85 : 0.5,
    text_case: p.upper ? "upper" : "default",
  };
}
