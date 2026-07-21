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
  "Upbeat Pop":
    "bright modern pop, catchy plucked synth hook, punchy real drums, groovy electric bass, hand claps, feel-good and radio-ready, energetic and polished, 118 BPM",
  "Funk Groove":
    "tight funk, syncopated slap electric bass, wah-wah rhythm guitar, live horn stabs, crisp drum kit, infectious danceable pocket, warm and lively, 108 BPM",
  "Ambient Calm":
    "serene ambient, soft evolving synth pads, gentle piano motifs, airy reverb, subtle field-recording textures, spacious and meditative, minimal percussion, 70 BPM",
  Synthwave:
    "retro synthwave, pulsing analog arpeggios, gated reverb drums, driving bass, neon nostalgic mood, cinematic 80s energy, 100 BPM",
  "Indie Anthem":
    "uplifting indie rock, jangly electric guitars, driving live drums, warm bass, big anthemic build, hopeful and euphoric, 122 BPM",
  "Trap Energy":
    "modern trap, booming 808 bass, crisp hi-hat rolls, dark atmospheric keys, hard-hitting and confident, contemporary and punchy, 140 BPM",
  "Latin Groove":
    "vibrant latin pop, syncopated nylon guitar, live congas and timbales, warm brass, infectious reggaeton-tinged rhythm, sunny and danceable, 96 BPM",
  "R&B Smooth":
    "smooth modern R&B, silky Rhodes chords, deep round bass, soft trap-influenced drums, lush background textures, sensual and laid-back, 84 BPM",
};

/** Genre keys in display order — single source of truth for the picker UI. */
export const MUSIC_GENRES = Object.keys(MUSIC_GENRE_PROMPTS);

/**
 * ACE-Step (vocals model) wants lowercase, comma-separated keyword TAGS — not a
 * display name. stable-audio/lyria2 drive style through the prompt above; the
 * vocals path reads these instead. Keys mirror MUSIC_GENRE_PROMPTS exactly.
 */
export const MUSIC_GENRE_TAGS: Record<string, string> = {
  "Epic Cinematic": "cinematic, orchestral, epic, score",
  "Lo-fi Chill": "lofi, chill, hiphop, mellow",
  "Corporate Jazz": "jazz, corporate, smooth, acoustic",
  Electronic: "electronic, edm, synth, upbeat",
  "Acoustic Folk": "folk, acoustic, guitar, indie",
  "Soulful Boom-bap": "boom bap, hiphop, soul, jazzy",
  "Upbeat Pop": "pop, upbeat, catchy, radio",
  "Funk Groove": "funk, groove, disco, bass",
  "Ambient Calm": "ambient, calm, atmospheric, chill",
  Synthwave: "synthwave, retro, 80s, synth",
  "Indie Anthem": "indie rock, anthemic, uplifting, guitar",
  "Trap Energy": "trap, 808, hiphop, hard",
  "Latin Groove": "latin, reggaeton, dance, tropical",
  "R&B Smooth": "rnb, smooth, soul, sensual",
};

// Appended to every music prompt to push the model toward natural instrumentation.
export const MUSIC_NATURAL_SUFFIX =
  "high-quality, natural acoustic instrumentation, warm analog tone, rich organic texture, real played instruments, no harsh digital synths, professional studio recording";

export const VIDEO_DURATION_PROMPTS: Record<string, string> = {
  video_10s:
    "short punchy social media clip, fast-paced, attention-grabbing, snappy motion",
  video_15s:
    "punchy social clip with room for a beat and a payoff, engaging pace, clear motion",
  video_30s:
    "dynamic narrative sequence, building story arc, engaging pacing, social content",
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
