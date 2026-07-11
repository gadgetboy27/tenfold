/**
 * Curated royalty-free music library for the compositor. Pixabay has NO music
 * API, but its Content License is no-attribution AND commercial-OK — ideal for
 * audio baked into a published video (platforms fingerprint copyrighted music).
 * So instead of a live API, host a curated set: download from
 * https://pixabay.com/music/, upload to the assets bucket, and add an entry
 * here (or paste any other no-attribution, commercially-cleared URL).
 *
 * Pure data — safe on client and server. Intentionally empty until curated: we
 * don't ship third-party audio files, and hotlinking a provider's CDN violates
 * their terms. The compositor's library picker only appears once this has entries.
 */

export interface MusicTrack {
  id: string;
  title: string;
  /** Vibe tag for grouping, e.g. "Upbeat", "Chill", "Cinematic". */
  mood: string;
  durationSec: number;
  /** Hosted MP3 URL (our storage) of a no-attribution, cleared track. */
  url: string;
}

export const MUSIC_LIBRARY: MusicTrack[] = [];

/** Whether the curated library has any tracks to offer yet. */
export function hasMusicLibrary(): boolean {
  return MUSIC_LIBRARY.length > 0;
}
