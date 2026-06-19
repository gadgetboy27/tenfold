// Talking-spokesperson ad videos: Claude script → ElevenLabs voice → VEED Fabric
// lip-sync. Every stage is a fal/Claude call that reuses the existing async-job +
// webhook + asset pattern — no new infrastructure.
//
// The pipeline is PRESENTER-SOURCE-AGNOSTIC: it takes a single `presenterImageUrl`
// (a public Supabase Storage URL). How that image is produced — user upload,
// in-app image generation, or a stock avatar — is owned by the UI, which resolves
// any of those to one URL before the talking_video job is submitted.

// --- fal endpoints (server-side only) ----------------------------------------

/** ElevenLabs Eleven v3 — text → speech. $0.10 / 1k characters. */
export const TTS_MODEL = "fal-ai/elevenlabs/tts/eleven-v3";

/** VEED Fabric 1.0 — image + audio → lip-synced talking video.
 *  $0.08/s (480p), $0.15/s (720p). */
export const LIPSYNC_MODEL = "veed/fabric-1.0";

// --- voices ------------------------------------------------------------------

export interface VoiceOption {
  /** ElevenLabs preset voice name passed straight to the TTS `voice` field. */
  id: string;
  /** Customer-facing label. */
  label: string;
  blurb: string;
}

export const DEFAULT_VOICE = "Rachel";

// A curated subset of ElevenLabs' preset voices — a male/female mix that reads
// well for product ads. The full roster is larger; this keeps the picker focused.
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "Rachel", label: "Rachel", blurb: "Warm, professional female — the reliable default." },
  { id: "Roger", label: "Roger", blurb: "Confident, grounded male presenter." },
  { id: "Sarah", label: "Sarah", blurb: "Friendly, upbeat female — great for lifestyle." },
  { id: "Laura", label: "Laura", blurb: "Calm, trustworthy female narration." },
  { id: "Charlie", label: "Charlie", blurb: "Energetic young male — punchy social ads." },
  { id: "Aria", label: "Aria", blurb: "Expressive, characterful female." },
];

export function getVoice(id: string | undefined | null): VoiceOption {
  return (
    VOICE_OPTIONS.find((v) => v.id === id) ??
    VOICE_OPTIONS.find((v) => v.id === DEFAULT_VOICE)!
  );
}

// --- languages (multi-language dubbing) --------------------------------------

export interface LanguageOption {
  /** ISO 639-1 code passed to ElevenLabs `language_code` + used to instruct Claude. */
  code: string;
  label: string;
}

export const DEFAULT_LANGUAGE = "en";

// Curated to the major ad markets. ElevenLabs v3 supports 70+ languages, so this
// list can grow freely — every entry reuses the exact same pipeline.
export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese (Mandarin)" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
];

export function getLanguage(code: string | undefined | null): LanguageOption {
  return (
    LANGUAGES.find((l) => l.code === code) ??
    LANGUAGES.find((l) => l.code === DEFAULT_LANGUAGE)!
  );
}

// --- presenter sources -------------------------------------------------------

/** How the on-screen presenter image is obtained. All three resolve to one
 *  `presenterImageUrl` before the job runs — this is a UI/upstream concern. */
export type PresenterSource = "upload" | "generate" | "stock";

export interface StockPresenter {
  id: string;
  label: string;
  /** Public Supabase Storage URL of the presenter image. */
  imageUrl: string;
}

// TODO(stock): populate with licensed presenter images uploaded to the public
// `assets` bucket. Kept empty (not faked) until real, cleared assets exist so the
// UI can show "stock library coming soon" rather than broken images.
export const STOCK_PRESENTERS: StockPresenter[] = [];

// --- resolution + cost -------------------------------------------------------

export type TalkingResolution = "480p" | "720p";

export const DEFAULT_TALKING_RESOLUTION: TalkingResolution = "480p";

/** Raw fal cost per second of lip-synced output, by resolution. */
export const LIPSYNC_USD_PER_SEC: Record<TalkingResolution, number> = {
  "480p": 0.08,
  "720p": 0.15,
};

// --- stage input builders ----------------------------------------------------

export interface TalkingVideoParams {
  /** Public image URL of the presenter (from upload / generate / stock). */
  presenterImageUrl: string;
  /** ElevenLabs voice id (see VOICE_OPTIONS). */
  voice: string;
  /** The spoken ad copy produced by Claude. */
  script: string;
  resolution: TalkingResolution;
}

/** Stage 2 — text → speech. Returns the fal input for {@link TTS_MODEL}.
 *  `languageCode` (ISO 639-1) enforces pronunciation for non-English dubs. */
export function ttsInput(p: {
  script: string;
  voice: string;
  languageCode?: string;
}): Record<string, unknown> {
  const input: Record<string, unknown> = {
    text: p.script,
    voice: getVoice(p.voice).id,
    stability: 0.5,
    similarity_boost: 0.75,
  };
  if (p.languageCode) input.language_code = p.languageCode;
  return input;
}

/** Stage 3 — image + audio → talking video. Returns the fal input for
 *  {@link LIPSYNC_MODEL}. `audioUrl` is the public URL produced by the TTS stage. */
export function lipsyncInput(p: {
  presenterImageUrl: string;
  audioUrl: string;
  resolution: TalkingResolution;
}): Record<string, unknown> {
  return {
    image_url: p.presenterImageUrl,
    audio_url: p.audioUrl,
    resolution: p.resolution,
  };
}
