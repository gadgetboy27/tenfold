import { CREDIT_COSTS } from "@/lib/credits/costs";

/**
 * A Series — several scenes around ONE subject, so a campaign reads as a set.
 * The subject is a picture the user already has (their upload, a gallery image,
 * the campaign's anchor); each scene is one line saying where it is and what
 * is around it. Pure helpers here; the route and the panel share them so the
 * limits cannot drift apart.
 */

export const SERIES_MIN = 2;
export const SERIES_MAX = 6;
export const SERIES_DEFAULT = 4;
/** One line of setting, not a paragraph. */
export const SCENE_MAX_CHARS = 200;
const SCENE_MIN_CHARS = 3;

/** What one scene costs — the existing image-variation price, never a copy. */
export const SCENE_CREDITS = CREDIT_COSTS.image_variation;

export function seriesCost(scenes: number): number {
  return scenes * SCENE_CREDITS;
}

/** Tidy one scene line: no control characters, list markers or quote marks. */
export function cleanScene(raw: string): string {
  return (
    raw
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // Marker and quotes come off AFTER the whitespace is tidied, or a closing
      // quote followed by a stray space is no longer "at the end".
      .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
      .trim()
      .slice(0, SCENE_MAX_CHARS)
      .trim()
  );
}

/** Clean, drop empties and repeats (case-insensitive), cap the count. */
export function cleanScenes(
  raw: readonly string[],
  max = SERIES_MAX,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const s = cleanScene(r);
    if (s.length < SCENE_MIN_CHARS) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === max) break;
  }
  return out;
}

/**
 * The instruction FLUX Kontext gets for one scene. It edits the reference
 * picture, so the first job is to say what must NOT change — the subject — and
 * only then where it now is. The scene is wrapped as data, never given the
 * chance to say "ignore the above".
 */
export function buildScenePrompt(scene: string): string {
  return (
    "Keep the subject of the reference image exactly as it is — the same shape, " +
    "colours, materials, proportions, and any text or logo on it. " +
    `Show that same subject in a new setting: ${cleanScene(scene)}. ` +
    "Natural, believable photography. Do not add any new text, watermark or logo."
  );
}
