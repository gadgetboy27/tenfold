/**
 * How a music bed combines with a clip's own audio.
 *
 * Pulled out of `composeVideo` as a pure function so the decision is testable
 * without FFmpeg (which only exists in the Docker runtime). The bug this
 * replaces was not a syntax error — it was a *decision* error, one line:
 *
 *     if (input.audioUrl) args.push("-map", "1:a:0")   // music replaces audio
 *
 * A Spokesperson video IS speech (the pipeline builds it from TTS + lipsync),
 * so mapping music over it deleted the voice — and still rendered, uploaded and
 * published successfully. Silent in both senses. That class of mistake is worth
 * a test even when the surrounding FFmpeg call isn't easily testable.
 */

/** Music bed level under a voice, in dB. Broadcast practice is ~-12 to -18. */
export const MUSIC_DUCK_DB = -14;

export interface AudioMixPlan {
  /** Extra entries for -filter_complex. Empty when no mixing is needed. */
  filters: string[];
  /** The label to -map for audio, or null to use a direct stream map. */
  label: string | null;
  /** Direct stream to map when `label` is null, or null to map nothing. */
  directMap: string | null;
  /** Whether -shortest should be added. */
  shortest: boolean;
}

export function planAudioMix(opts: {
  hasMusic: boolean;
  clipHasAudio: boolean;
}): AudioMixPlan {
  // Music over a clip that already speaks: duck and mix, never replace.
  if (opts.hasMusic && opts.clipHasAudio) {
    return {
      filters: [
        `[1:a]volume=${MUSIC_DUCK_DB}dB[bed]`,
        // duration=first ties the mix to the clip, so a longer music track
        // can't extend the video; dropout_transition=0 avoids an audible dip
        // when one input ends.
        `[0:a][bed]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
      ],
      label: "aout",
      directMap: null,
      shortest: true,
    };
  }
  // Music over silent footage: map it straight through.
  if (opts.hasMusic) {
    return { filters: [], label: null, directMap: "1:a:0", shortest: true };
  }
  // No music: keep the clip's own audio if it has any. The `?` makes the map
  // optional so a silent clip doesn't fail the render.
  return { filters: [], label: null, directMap: "0:a?", shortest: false };
}
