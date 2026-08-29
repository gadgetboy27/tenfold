/**
 * Music that arrived after the video was exported.
 *
 * FFmpeg muxes the audio track at export time (`lib/composition/video.ts`,
 * `lib/composition/export.ts` — both take `audioUrl` as an input). So a
 * `composed_video` is a permanent snapshot of whatever music existed the moment
 * it was rendered.
 *
 * Publish reused any existing `composed_video` unconditionally. Generate the
 * music AFTER using the Compositor — which the nav has always allowed, since
 * you can jump to any tool at any time — and the export stays silent, publish
 * reuses it, and the post goes out with no sound. Nothing anywhere said so.
 *
 * The fix is to compare timestamps and re-mux the music onto the EXPORT rather
 * than back onto the raw clip: the export carries the text overlays and brand
 * work, so rebuilding from the raw video would silently discard all of it to
 * rescue the audio. Muxing onto the export keeps both.
 */

export interface Timestamped {
  created_at: string;
}

/**
 * Is this export missing music that already exists?
 *
 * True only when there IS a music track and it is strictly newer than the
 * export. Equal timestamps mean the export already carries it — the export
 * reads the newest audio asset at render time, so a track written in the same
 * instant is the one it used.
 */
export function needsMusicRemux(
  exportedAt: string,
  musicAt: string | null | undefined,
): boolean {
  if (!musicAt) return false;
  return new Date(musicAt).getTime() > new Date(exportedAt).getTime();
}

/**
 * Which of a campaign's exports predate the music, newest-first order kept.
 *
 * Every fan-out aspect is checked, not just the one about to be posted: each
 * aspect is its own render, so a 9:16 cut made before the music is exactly as
 * silent as the 1:1 — and per-platform publishing picks between them.
 *
 * The publish route inlines this as a loop (it has to remux as it goes, not
 * just count); this is the same predicate, kept here so the selection rule is
 * testable without FFmpeg or a database.
 */
export function staleExports<T extends Timestamped>(
  exports: readonly T[],
  musicAt: string | null | undefined,
): T[] {
  if (!musicAt) return [];
  return exports.filter((e) => needsMusicRemux(e.created_at, musicAt));
}
