import { PLATFORM_FORMATS, type PlatformId } from "@/lib/composition/formats";
import { PLATFORM_GUIDE } from "@/lib/social/caption-guide";
import type { CompositionAspect } from "@/lib/composition/layers";

/**
 * "Platform-native defaults" (PRODUCT_STRATEGY.md §4): what a platform should
 * get automatically instead of the user configuring it per-post, every time.
 * Aspect and caption tone already existed elsewhere (PLATFORM_FORMATS drives
 * the compositor's fan-out, PLATFORM_GUIDE drives adapt-captions) — this
 * module doesn't duplicate them, just adds the one genuinely new piece
 * (whether a music bed makes sense for that placement) and reads the rest.
 */

// Placements where a music bed doesn't fit the platform's own norm — text/
// professional-first feeds (LinkedIn, Google Business), or platforms that
// commonly autoplay muted (Pinterest, Reddit, Telegram). Everything else
// (TikTok, Instagram, YouTube, X, Facebook, Threads, Snapchat, Bluesky)
// defaults to keeping the music, since it's part of the format there.
const NO_MUSIC_BY_DEFAULT = new Set<PlatformId>([
  "linkedin",
  "pinterest",
  "reddit",
  "gmb",
  "telegram",
]);

export interface PlatformDefaults {
  aspect: CompositionAspect;
  music: boolean;
  toneHint: string | null;
}

export function platformDefaults(platform: string): PlatformDefaults {
  const format = PLATFORM_FORMATS[platform as PlatformId];
  return {
    aspect: format?.aspect ?? "1:1",
    music: !NO_MUSIC_BY_DEFAULT.has(platform as PlatformId),
    toneHint: PLATFORM_GUIDE[platform]?.style ?? null,
  };
}
