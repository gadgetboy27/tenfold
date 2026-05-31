export const IMAGE_STYLE_SUFFIXES: Record<string, string> = {
  Photorealistic: 'photorealistic, ultra-detailed, sharp focus, professional photography',
  Illustration: 'digital illustration, artistic, stylized, vibrant colors',
  Cinematic: 'cinematic, film grain, dramatic lighting, anamorphic lens, widescreen',
  '3D': '3D render, CGI, volumetric lighting, octane render, subsurface scattering',
};

export const MUSIC_GENRE_PROMPTS: Record<string, string> = {
  'Epic Cinematic':
    'epic orchestral score, soaring strings, powerful brass, dramatic percussion, cinematic trailer music, 130 BPM',
  'Lo-fi Chill':
    'lo-fi hip hop, warm vinyl crackle, mellow jazz chords, relaxed beats, 75 BPM, cozy atmosphere',
  'Corporate Jazz':
    'upbeat corporate jazz, bright piano, clean guitar, walking bass line, professional background music, 100 BPM',
  Electronic:
    'modern electronic, pulsing synths, driving four-on-the-floor beat, energetic build-ups, 128 BPM',
  'Acoustic Folk':
    'acoustic folk, fingerpicked guitar, gentle warm melody, organic natural sound, uplifting, 90 BPM',
  'Hip-hop Beat':
    'hip hop instrumental, punchy 808 bass, crisp snare, sample-flipped melody, confident urban groove, 95 BPM',
};

export const VIDEO_DURATION_PROMPTS: Record<string, string> = {
  video_10s: 'short punchy social media clip, fast-paced, attention-grabbing, snappy motion',
  video_30s: 'dynamic narrative sequence, building story arc, engaging pacing, social content',
  video_60s: 'cinematic brand story, sweeping composition, deliberate pacing, high production value',
};

export type VideoStyle = 'Cinematic' | 'Fast-cut' | 'Dramatic' | 'Smooth';

export const VIDEO_STYLE_PROMPTS: Record<
  VideoStyle,
  { prompt: string; negativePrompt: string }
> = {
  Cinematic: {
    prompt: 'cinematic lighting, anamorphic lens, film grain, widescreen',
    negativePrompt: 'blur, distort, low quality, watermark, text overlay, shaky, amateur',
  },
  'Fast-cut': {
    prompt: 'dynamic motion, high contrast, sharp focus, energetic transitions',
    negativePrompt: 'blur, slow motion, low quality, watermark, text overlay, static',
  },
  Dramatic: {
    prompt: 'dramatic lighting, deep shadows, moody atmosphere, high contrast',
    negativePrompt: 'blur, flat lighting, low quality, watermark, text overlay, overexposed',
  },
  Smooth: {
    prompt: 'smooth camera movement, soft natural lighting, elegant flowing',
    negativePrompt: 'blur, distort, low quality, watermark, text overlay, jerky, noise',
  },
};
