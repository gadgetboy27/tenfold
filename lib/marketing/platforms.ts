/**
 * The networks marketing copy may PROMISE — the single source for every
 * "publish to …" claim on the public site, its schema, and llms.txt's intent.
 *
 * Why a static list and not `lib/social/configured.ts`: marketing pages
 * prerender at build, where production env vars are not guaranteed, and a
 * public claim must not flip with a build environment. So this list is
 * maintained by hand and must match what production actually serves.
 *
 * Rule: a network moves from UPCOMING to LIVE only when its gate env var is
 * set on the `tenfold` Railway service AND a real post has gone out through
 * it (CLAUDE.md §7d). Ayrshare-only networks (X, Threads, Snapchat, GMB,
 * Telegram) belong in neither list while `AYRSHARE_ENABLED` is off — it is
 * too expensive to run before customer volume justifies it.
 *
 * The site used to say "up to 13 platforms", which counted every Ayrshare
 * network while Ayrshare was switched off. Promise what ships.
 */
export interface MarketingPlatform {
  id: string;
  label: string;
  /** Badge text — keep to ~4 characters. */
  short: string;
  color: string;
}

export const LIVE_PLATFORMS: MarketingPlatform[] = [
  { id: "facebook", short: "FB", label: "Facebook", color: "#1877F2" },
  { id: "instagram", short: "IG", label: "Instagram", color: "#E1306C" },
  { id: "tiktok", short: "TT", label: "TikTok", color: "#69C9D0" },
  { id: "bluesky", short: "Bsky", label: "Bluesky", color: "#0085FF" },
];

/** Adapters built, waiting on each platform's developer approval. */
export const UPCOMING_PLATFORMS: MarketingPlatform[] = [
  { id: "linkedin", short: "LI", label: "LinkedIn", color: "#0A66C2" },
  { id: "pinterest", short: "PI", label: "Pinterest", color: "#E60023" },
  { id: "reddit", short: "RD", label: "Reddit", color: "#FF4500" },
  { id: "youtube", short: "YT", label: "YouTube", color: "#FF0000" },
];

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

function joinNames(list: MarketingPlatform[]): string {
  const names = list.map((p) => p.label);
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Facebook, Instagram, TikTok and Bluesky" */
export const LIVE_PLATFORM_NAMES = joinNames(LIVE_PLATFORMS);
/** "LinkedIn, Pinterest, Reddit and YouTube" */
export const UPCOMING_PLATFORM_NAMES = joinNames(UPCOMING_PLATFORMS);
/** "4 social networks" — for space-constrained copy. */
export const LIVE_PLATFORM_COUNT_LABEL = `${LIVE_PLATFORMS.length} social networks`;
/** "four" — for prose. */
export const LIVE_PLATFORM_COUNT_WORD =
  NUMBER_WORDS[LIVE_PLATFORMS.length] ?? String(LIVE_PLATFORMS.length);
