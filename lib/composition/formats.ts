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
  format: PlatformFormat,
  threshold = 0.1,
): SafeZone[] {
  const boxArea = box.w * box.h;
  if (boxArea <= 0) return [];
  return format.safeZones.filter(
    (z) => intersectionArea(box, z) / boxArea >= threshold,
  );
}
