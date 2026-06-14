export const IMAGE_STYLE_SUFFIXES: Record<string, string> = {
  Photorealistic:
    "photorealistic, ultra-detailed, sharp focus, professional photography",
  Illustration: "digital illustration, artistic, stylized, vibrant colors",
  Cinematic:
    "cinematic, film grain, dramatic lighting, anamorphic lens, widescreen",
  "3D": "3D render, CGI, volumetric lighting, octane render, subsurface scattering",
};

// Genre prompts deliberately favour REAL, played instruments and warm analog
// recording over synthetic/808 textures — earlier output sounded too synthetic.
export const MUSIC_GENRE_PROMPTS: Record<string, string> = {
  "Epic Cinematic":
    "epic orchestral score performed by a live symphony orchestra, lush real strings, genuine brass section, timpani and taiko drums, warm concert-hall recording, organic dynamics, 120 BPM",
  "Lo-fi Chill":
    "warm lo-fi, real Rhodes electric piano, softly plucked nylon guitar, brushed live drums, upright bass, gentle vinyl warmth, organic and mellow, 75 BPM",
  "Corporate Jazz":
    "acoustic jazz trio, warm grand piano, upright double bass, brushed drum kit, clean hollow-body guitar, recorded live in studio, smooth and professional, 100 BPM",
  Electronic:
    "organic electronic, warm analog synths blended with real live bass and hand percussion, airy textures, musical and natural rather than harsh, 116 BPM",
  "Acoustic Folk":
    "intimate acoustic folk, fingerpicked steel-string guitar, soft mandolin, warm upright bass, brushed snare, gentle natural room recording, uplifting, 90 BPM",
  "Soulful Boom-bap":
    "warm boom-bap hip hop, dusty soul samples, live electric bass, soft real drums, mellow Rhodes chords, organic vinyl texture, laid-back groove, 90 BPM",
};

// Appended to every music prompt to push the model toward natural instrumentation.
export const MUSIC_NATURAL_SUFFIX =
  "high-quality, natural acoustic instrumentation, warm analog tone, rich organic texture, real played instruments, no harsh digital synths, professional studio recording";

export const VIDEO_DURATION_PROMPTS: Record<string, string> = {
  video_10s:
    "short punchy social media clip, fast-paced, attention-grabbing, snappy motion",
  video_30s:
    "dynamic narrative sequence, building story arc, engaging pacing, social content",
  video_60s:
    "cinematic brand story, sweeping composition, deliberate pacing, high production value",
};

export type VideoStyle = "Cinematic" | "Fast-cut" | "Dramatic" | "Smooth";

export const VIDEO_STYLE_PROMPTS: Record<
  VideoStyle,
  { prompt: string; negativePrompt: string }
> = {
  Cinematic: {
    prompt: "cinematic lighting, anamorphic lens, film grain, widescreen",
    negativePrompt:
      "blur, distort, low quality, watermark, text overlay, shaky, amateur",
  },
  "Fast-cut": {
    prompt: "dynamic motion, high contrast, sharp focus, energetic transitions",
    negativePrompt:
      "blur, slow motion, low quality, watermark, text overlay, static",
  },
  Dramatic: {
    prompt: "dramatic lighting, deep shadows, moody atmosphere, high contrast",
    negativePrompt:
      "blur, flat lighting, low quality, watermark, text overlay, overexposed",
  },
  Smooth: {
    prompt: "smooth camera movement, soft natural lighting, elegant flowing",
    negativePrompt:
      "blur, distort, low quality, watermark, text overlay, jerky, noise",
  },
};
