import {
  ASPECT_DESIGN,
  type CompositionAspect,
} from "@/lib/composition/layers";

/**
 * Platform format registry + safe zones (docs/multiformat-manifesto.md §5,
 * Phase 2). Maps each social platform to the aspect its master composition
 * reflows into, the recommended export dimensions, and the rectangles where the
 * platform's own UI chrome covers content (so a layer landing there earns a ⚠).
 *
 * Pure config + helpers — no node/browser imports, shared by the client rail
 * (Phase 3) and the server fan-out export (Phase 5), same discipline as
 * layers.ts.
 *
 * Platform ids are the canonical slugs the rest of the app already uses
 * (lib/validation/schemas.ts publishSchema, social_profiles.platform). NOTE:
 * aspect choices, dimensions, and safe-zone rects are best-effort defaults to be
 * reconciled against Ayrshare's authoritative per-platform specs — deliberately
 * kept in this one table so tuning is a single-file change. Platforms with
 * multiple placements (e.g. Instagram feed 4:5 vs Reels 9:16) map to their
 * primary VIDEO surface, since the compositor outputs video.
 */

export type PlatformId =
  | "instagram"
  | "facebook"
  | "twitter"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "pinterest"
  | "reddit"
  | "telegram"
  | "threads"
  | "snapchat"
  | "bluesky"
  | "gmb";

/** A rectangle of the format canvas the platform's UI occludes, normalized
 *  0..1 of width/height. `label` explains what covers it (for the ⚠ tooltip). */
export interface SafeZone {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlatformFormat {
  id: PlatformId;
  /** Display name (matches the app's picker labels). */
  label: string;
  /** Which of the three design spaces the master reflows into. */
  aspect: CompositionAspect;
  /** Recommended export size (= ASPECT_DESIGN[aspect], surfaced explicitly). */
  width: number;
  height: number;
  /** UI-chrome occlusion zones for this placement. */
  safeZones: SafeZone[];
}

// ── Reusable safe-zone fragments ─────────────────────────────────────────────
// Vertical placements share the same chrome shape: a right-hand action rail and
// a bottom caption/nav strip. Values are approximate and tunable.

const rightActionRail = (y: number, h: number): SafeZone => ({
  label: "action buttons (like / comment / share)",
  x: 0.85,
  y,
  w: 0.15,
  h,
});

const bottomCaption = (y: number): SafeZone => ({
  label: "caption, username & audio",
  x: 0,
  y,
  w: 0.85,
  h: 1 - y,
});

const dims = (aspect: CompositionAspect) => ASPECT_DESIGN[aspect];

export const PLATFORM_FORMATS: Record<PlatformId, PlatformFormat> = {
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    aspect: "9:16",
    ...dims("9:16"),
    safeZones: [rightActionRail(0.42, 0.4), bottomCaption(0.78)],
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    aspect: "9:16",
    ...dims("9:16"),
    safeZones: [rightActionRail(0.4, 0.4), bottomCaption(0.8)],
  },
  snapchat: {
    id: "snapchat",
    label: "Snapchat",
    aspect: "9:16",
    ...dims("9:16"),
    safeZones: [rightActionRail(0.45, 0.4), bottomCaption(0.85)],
  },
  pinterest: {
    id: "pinterest",
    label: "Pinterest",
    aspect: "9:16",
    ...dims("9:16"),
    safeZones: [
      { label: "title", x: 0, y: 0, w: 1, h: 0.1 },
      bottomCaption(0.85),
    ],
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    aspect: "16:9",
    ...dims("16:9"),
    safeZones: [{ label: "playback controls", x: 0, y: 0.88, w: 1, h: 0.12 }],
  },
  twitter: {
    id: "twitter",
    label: "X (Twitter)",
    aspect: "16:9",
    ...dims("16:9"),
    safeZones: [],
  },
  reddit: {
    id: "reddit",
    label: "Reddit",
    aspect: "16:9",
    ...dims("16:9"),
    safeZones: [],
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    aspect: "16:9",
    ...dims("16:9"),
    safeZones: [],
  },
  gmb: {
    id: "gmb",
    label: "Google Business",
    aspect: "16:9",
    ...dims("16:9"),
    safeZones: [],
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    aspect: "1:1",
    ...dims("1:1"),
    safeZones: [],
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    aspect: "1:1",
    ...dims("1:1"),
    safeZones: [],
  },
  threads: {
    id: "threads",
    label: "Threads",
    aspect: "1:1",
    ...dims("1:1"),
    safeZones: [],
  },
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    aspect: "1:1",
    ...dims("1:1"),
    safeZones: [],
  },
};

/** Type guard: is a raw social_profiles.platform string a known format? */
export function isPlatformId(x: string): x is PlatformId {
  return x in PLATFORM_FORMATS;
}

// ── Video length guidance ────────────────────────────────────────────────────
// Per-platform durations (seconds), from 2026 platform guidance. `recommended`
// is the engagement sweet spot; `max` is the platform's hard cap. Kept beside
// the format registry; keys mirror PLATFORM_FORMATS (asserted in tests).

export const PLATFORM_DURATION: Record<
  PlatformId,
  { recommended: number; max: number }
> = {
  tiktok: { recommended: 30, max: 600 }, // sweet spot 15–34s; 10min in-app
  instagram: { recommended: 30, max: 180 }, // Reels: 7–15s viral, 30–45s value
  snapchat: { recommended: 20, max: 60 },
  pinterest: { recommended: 15, max: 60 },
  youtube: { recommended: 55, max: 180 }, // Shorts sweet spot ~55s; 3min cap
  twitter: { recommended: 30, max: 140 }, // X standard 2:20
  reddit: { recommended: 30, max: 900 },
  telegram: { recommended: 30, max: 600 },
  gmb: { recommended: 30, max: 30 }, // Google Business ~30s
  facebook: { recommended: 30, max: 90 }, // Reels 90s
  linkedin: { recommended: 30, max: 600 },
  threads: { recommended: 30, max: 300 },
  bluesky: { recommended: 30, max: 60 },
};

/** Video-gen tiers our engine can actually produce (fal.ai Kling) — mirrors the
 *  video_10s / video_30s / video_60s credit costs. */
export const VIDEO_GEN_TIERS = [10, 30, 60] as const;
export type VideoGenTier = (typeof VIDEO_GEN_TIERS)[number];

/** Nearest producible gen tier to a target length. */
export function snapToGenTier(sec: number): VideoGenTier {
  return VIDEO_GEN_TIERS.reduce((best, t) =>
    Math.abs(t - sec) < Math.abs(best - sec) ? t : best,
  );
}

/** Recommended gen length for a set of target platforms: the shortest sweet spot
 *  (safe cross-platform), snapped to a tier we can generate. Defaults to 30s. */
export function recommendVideoDuration(platforms: string[]): VideoGenTier {
  const recs = platforms
    .filter(isPlatformId)
    .map((p) => PLATFORM_DURATION[p].recommended);
  return snapToGenTier(recs.length ? Math.min(...recs) : 30);
}

/** Platforms whose hard cap the given video exceeds — a "too long" flag for
 *  uploaded backgrounds that outrun a platform's limit. */
export function overLengthPlatforms(
  durationSec: number,
  platforms: string[],
): PlatformId[] {
  return platforms
    .filter(isPlatformId)
    .filter((p) => durationSec > PLATFORM_DURATION[p].max);
}

/**
 * The rail's format list for a set of connected platforms (raw slugs from
 * social_profiles). Unknown slugs are dropped, duplicates collapsed, input
 * order preserved — one thumbnail per distinct connected platform.
 */
export function formatsForPlatforms(connected: string[]): PlatformFormat[] {
  const seen = new Set<PlatformId>();
  const out: PlatformFormat[] = [];
  for (const slug of connected) {
    if (!isPlatformId(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(PLATFORM_FORMATS[slug]);
  }
  return out;
}

/**
 * The distinct aspects a set of formats needs — the export fan-out only renders
 * each aspect once (safe zones affect the ⚠ overlay, not the pixels). First-seen
 * order preserved.
 */
export function distinctAspects(
  formats: PlatformFormat[],
): CompositionAspect[] {
  const seen = new Set<CompositionAspect>();
  const out: CompositionAspect[] = [];
  for (const f of formats) {
    if (seen.has(f.aspect)) continue;
    seen.add(f.aspect);
    out.push(f.aspect);
  }
  return out;
}

/** An axis-aligned box in normalized (0..1) canvas coordinates. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Intersection area of two normalized rects (0 if disjoint). */
export function intersectionArea(a: NormRect, b: NormRect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

/**
 * Which of a format's safe zones a layer's box meaningfully intrudes into — the
 * ⚠ flag. A zone counts only when it covers at least `threshold` of the layer's
 * own area, so a hairline clip doesn't cry wolf.
 */
export function zoneIntrusions(
  box: NormRect,
  format: { safeZones: SafeZone[] },
  threshold = 0.1,
): SafeZone[] {
  const boxArea = box.w * box.h;
  if (boxArea <= 0) return [];
  return format.safeZones.filter(
    (z) => intersectionArea(box, z) / boxArea >= threshold,
  );
}

/**
 * Every distinct safe zone that ANY of the given layer boxes intrudes into —
 * the aggregated ⚠ set for one format thumbnail. Deduped by zone label.
 */
export function formatWarnings(
  boxes: NormRect[],
  safeZones: SafeZone[],
  threshold = 0.1,
): SafeZone[] {
  const hit = new Map<string, SafeZone>();
  for (const box of boxes) {
    for (const z of zoneIntrusions(box, { safeZones }, threshold)) {
      hit.set(z.label, z);
    }
  }
  return [...hit.values()];
}

// ── Rail items ───────────────────────────────────────────────────────────────
// The format rail (Phase 3) renders one thumbnail per item. A RailFormat is the
// UI-facing shape both real platform formats and the lab-mode fallback satisfy.

export interface RailFormat {
  /** Stable React key (platform id, or a generic aspect key). */
  key: string;
  label: string;
  aspect: CompositionAspect;
  safeZones: SafeZone[];
}

/** Lab-mode fallback: one item per aspect, so the designer still previews across
 *  shapes when no social accounts are connected. */
export const GENERIC_RAIL: RailFormat[] = [
  { key: "vertical", label: "Vertical", aspect: "9:16", safeZones: [] },
  { key: "square", label: "Square", aspect: "1:1", safeZones: [] },
  { key: "landscape", label: "Landscape", aspect: "16:9", safeZones: [] },
];

/**
 * The value (e.g. a rendered MP4/asset) a platform should receive, given a map
 * keyed by aspect and a fallback — the per-platform publish policy. Picks the
 * platform's format aspect from the registry; falls back when that aspect has no
 * entry or the platform is unknown.
 */
export function pickForPlatform<T>(
  platform: string,
  byAspect: Map<string, T>,
  fallback: T,
): T {
  if (isPlatformId(platform)) {
    const v = byAspect.get(PLATFORM_FORMATS[platform].aspect);
    if (v !== undefined) return v;
  }
  return fallback;
}

/** Rail items for a set of connected platform slugs, or the generic trio when
 *  none are recognised (see formatsForPlatforms for filtering/dedup rules). */
export function railFormats(connected: string[]): RailFormat[] {
  const formats = formatsForPlatforms(connected);
  if (formats.length === 0) return GENERIC_RAIL;
  return formats.map((f) => ({
    key: f.id,
    label: f.label,
    aspect: f.aspect,
    safeZones: f.safeZones,
  }));
}
