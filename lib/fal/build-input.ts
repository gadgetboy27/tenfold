import {
  getVideoModel,
  DEFAULT_VIDEO_MODEL,
  videoInputFor,
} from "@/lib/fal/models";
import {
  IMAGE_STYLE_SUFFIXES,
  MUSIC_GENRE_PROMPTS,
  MUSIC_NATURAL_SUFFIX,
  VIDEO_DURATION_PROMPTS,
  VIDEO_STYLE_PROMPTS,
  type VideoStyle,
} from "@/lib/fal/prompts";

/**
 * Builds the provider input for a generation type.
 *
 * Extracted verbatim from app/api/jobs/route.ts (which still calls it, so the
 * live path is unchanged) because the foreman needs to create the same jobs.
 * Duplicating it would have been the drift lib/credits/CLAUDE.md keeps warning
 * about: two builders diverge the first time a prompt or a model input changes,
 * and the orchestrated run would quietly produce different output from the
 * manual one.
 */
export function buildFalInput(
  type: string,
  params: Record<string, unknown>,
  prompt: string,
) {
  if (type === "image_generation") {
    const styleSuffix = IMAGE_STYLE_SUFFIXES[params.style as string] ?? "";
    const fullPrompt = styleSuffix ? `${prompt}, ${styleSuffix}` : prompt;
    return {
      prompt: fullPrompt,
      image_size: (params.imageSize as string) ?? "square_hd",
      num_images: 1, // Ad-hoc single image. Initial campaigns use num_images: 4 (see campaigns/route.ts)
      seed: params.seed as number | undefined,
    };
  }
  if (type === "video_10s" || type === "video_15s" || type === "video_30s") {
    // Kling v3 seconds PER CALL. 10s/15s are single calls; 30s renders as 2× 15s
    // segments (see the video_30s enqueue below), so its per-segment duration is 15.
    const durationMap: Record<string, number> = {
      video_10s: 10,
      video_15s: 15,
      video_30s: 15,
    };
    const style = (params.videoStyle as VideoStyle) ?? "Cinematic";
    const durationBrief = VIDEO_DURATION_PROMPTS[type];
    const styleBrief = VIDEO_STYLE_PROMPTS[style].prompt;
    const variationDir = (params.variationDirection as string) ?? "";
    const composedParts = [
      durationBrief,
      styleBrief,
      prompt,
      variationDir ? `with ${variationDir}` : "",
    ].filter(Boolean);
    const composedPrompt = composedParts.join(", ");
    // Field names + types come from the registry (start_image_url, string
    // duration, generate_audio off) — hand-building this was the timeout bug.
    const model = getVideoModel(
      (params.videoModel as string) ?? DEFAULT_VIDEO_MODEL,
    );
    return videoInputFor(model, {
      imageUrl: params.imageUrl as string,
      prompt: composedPrompt,
      durationSec: durationMap[type],
      negativePrompt: VIDEO_STYLE_PROMPTS[style].negativePrompt,
      generateAudio: params.generateAudio === true,
    });
  }
  if (type === "music_generation") {
    const genre = (params.genre as string) ?? "Lo-fi Chill";
    const genrePrompt =
      MUSIC_GENRE_PROMPTS[genre] ?? MUSIC_GENRE_PROMPTS["Lo-fi Chill"];
    const variationDir = (params.variationDirection as string) ?? "";
    const base = variationDir
      ? `${genrePrompt}, but ${variationDir}`
      : genrePrompt;
    const finalPrompt = `${base}. ${MUSIC_NATURAL_SUFFIX}`;
    // Match the track length to the chosen video duration (stable-audio caps
    // around 47s, so clamp). Falls back to 30s when no video length is given.
    const requested = Number(params.durationSec);
    const seconds =
      Number.isFinite(requested) && requested > 0 ? requested : 30;
    return {
      prompt: finalPrompt,
      seconds_total: Math.min(seconds, 47),
      steps: 100,
    };
  }
  return params;
}
