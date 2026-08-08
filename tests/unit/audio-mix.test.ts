import { describe, it, expect } from "vitest";
import { planAudioMix, MUSIC_DUCK_DB } from "@/lib/composition/audio-mix";

describe("planAudioMix", () => {
  // The regression. A Spokesperson video IS speech — TTS + lipsync — so the
  // old `-map 1:a:0` deleted the voice and still produced a valid MP4 that
  // uploaded and published cleanly. Nothing failed; the words were just gone.
  it("ducks music under a clip that already has audio, never replaces it", () => {
    const plan = planAudioMix({ hasMusic: true, clipHasAudio: true });
    expect(plan.label).toBe("aout");
    expect(plan.directMap).toBeNull();
    expect(plan.filters.join(" ")).toContain("amix=inputs=2");
    // The clip's own audio must be an input to the mix, not discarded.
    expect(plan.filters.join(" ")).toContain("[0:a]");
    expect(plan.filters.join(" ")).toContain(`volume=${MUSIC_DUCK_DB}dB`);
  });

  it("maps music straight through when the clip is silent", () => {
    const plan = planAudioMix({ hasMusic: true, clipHasAudio: false });
    expect(plan.filters).toEqual([]);
    expect(plan.directMap).toBe("1:a:0");
    expect(plan.label).toBeNull();
  });

  it("keeps the clip's own audio when there is no music", () => {
    const plan = planAudioMix({ hasMusic: false, clipHasAudio: true });
    expect(plan.directMap).toBe("0:a?");
    expect(plan.filters).toEqual([]);
    // No -shortest: there's no second stream that could truncate the video.
    expect(plan.shortest).toBe(false);
  });

  it("uses an optional map for a silent clip so the render can't fail", () => {
    const plan = planAudioMix({ hasMusic: false, clipHasAudio: false });
    expect(plan.directMap).toBe("0:a?");
  });

  it("ties the mix to the clip so long music cannot extend the video", () => {
    const plan = planAudioMix({ hasMusic: true, clipHasAudio: true });
    expect(plan.filters.join(" ")).toContain("duration=first");
    expect(plan.shortest).toBe(true);
  });

  it("ducks by a level that leaves speech intelligible", () => {
    // Broadcast practice for music under voice is roughly -12 to -18 dB.
    expect(MUSIC_DUCK_DB).toBeLessThanOrEqual(-12);
    expect(MUSIC_DUCK_DB).toBeGreaterThanOrEqual(-18);
  });
});
