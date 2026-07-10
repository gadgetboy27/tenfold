/**
 * Curated royalty-free music library for the compositor (docs/multiformat-
 * manifesto.md — music options). Pixabay has NO music API, but its Content
 * License requires no attribution AND allows commercial use — ideal for audio
 * baked into a published video (social platforms fingerprint copyrighted music).
 * So instead of a live API, we host a curated set: download a track from
 * https://pixabay.com/music/, upload it to the assets bucket, and add an entry
 * here (or paste any other no-attribution, commercially-cleared URL).
 *
 * Pure data — no node/browser imports, safe on client and server.
 *
 * NOTE: intentionally empty until curated. We don't ship third-party audio
 * files, and hotlinking a provider's CDN violates their terms — host our own
 * copies. The compositor's library picker only appears once this has entries.
 */

export interface MusicTrack {
  id: string;
  title: string;
  /** Vibe tag for grouping/filtering, e.g. "Upbeat", "Chill", "Cinematic". */
  mood: string;
  durationSec: number;
  /** Hosted MP3 URL (our storage) of a no-attribution, commercially-cleared track. */
  url: string;
}

export const MUSIC_LIBRARY: MusicTrack[] = [];

/** Whether the curated library has any tracks to offer yet. */
export function hasMusicLibrary(): boolean {
  return MUSIC_LIBRARY.length > 0;
}

/** Distinct mood tags present in the library (for a grouped picker). */
export function musicMoods(): string[] {
  return [...new Set(MUSIC_LIBRARY.map((t) => t.mood))];
}
