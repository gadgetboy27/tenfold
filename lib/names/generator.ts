/**
 * Friendly project names.
 *
 * There used to be TWO of these — this file (45×45) and
 * `lib/util/campaign-name.ts` (16×16) — and Studio, the only live surface,
 * imported the small one. 256 combinations against a workspace with 50
 * campaigns makes a collision about 99% likely, which is how one workspace
 * ended up with four projects called "Amber Pulse". Both words are in that
 * short list.
 *
 * One list now, and the words are merged rather than picked, so nothing that
 * was reachable before disappears.
 */

const ADJECTIVES = [
  "Amber",
  "Apex",
  "Azure",
  "Bold",
  "Bright",
  "Cobalt",
  "Coastal",
  "Cosmic",
  "Crimson",
  "Crystal",
  "Dynamic",
  "Electric",
  "Ember",
  "Emerald",
  "Epic",
  "Fierce",
  "Fresh",
  "Golden",
  "Iconic",
  "Infinite",
  "Iron",
  "Jade",
  "Lunar",
  "Midnight",
  "Neon",
  "Nova",
  "Obsidian",
  "Onyx",
  "Phantom",
  "Primal",
  "Prism",
  "Pure",
  "Quiet",
  "Radiant",
  "Sharp",
  "Silver",
  "Solar",
  "Stellar",
  "Summit",
  "Sunlit",
  "Swift",
  "Titan",
  "Urban",
  "Velvet",
  "Vivid",
  "Wild",
  "Zenith",
] as const;

const NOUNS = [
  "Anthem",
  "Arc",
  "Beacon",
  "Bloom",
  "Burst",
  "Canvas",
  "Chapter",
  "Charge",
  "Cipher",
  "Circuit",
  "Crest",
  "Current",
  "Drift",
  "Drive",
  "Drop",
  "Echo",
  "Edge",
  "Flare",
  "Flow",
  "Force",
  "Frame",
  "Glow",
  "Horizon",
  "Impact",
  "Launch",
  "Mark",
  "Moment",
  "Momentum",
  "Motion",
  "Nexus",
  "Orbit",
  "Peak",
  "Pulse",
  "Reach",
  "Reel",
  "Rise",
  "Rush",
  "Shift",
  "Signal",
  "Spark",
  "Story",
  "Stride",
  "Surge",
  "Thread",
  "Tide",
  "Vector",
  "Vision",
  "Wave",
] as const;

/** 47 × 48 = 2,256 combinations, up from 256. */
export const NAME_COMBINATIONS = ADJECTIVES.length * NOUNS.length;

function pick(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a} ${n}`;
}

/**
 * A friendly random project name, avoiding any name already in use.
 *
 * A bigger pool alone only delays the problem — the birthday paradox means
 * even 2,256 combinations collide about 40% of the time by the 50th project,
 * and a user who sees two "Amber Pulse" doesn't care about the odds. So when
 * the caller knows what's taken, this actually checks.
 *
 * Bounded retries, then a numeric suffix: an unbounded "keep trying" loop
 * spins forever once the pool is exhausted, which is a hang rather than a
 * duplicate — strictly worse. The suffix is also honest about what happened,
 * where a silent duplicate isn't.
 *
 * Comparison is case- and space-insensitive so "amber pulse" counts as taken.
 */
export function generateCampaignName(taken: Iterable<string> = []): string {
  const used = new Set<string>();
  for (const t of taken) {
    const k = t.trim().toLowerCase().replace(/\s+/g, " ");
    if (k) used.add(k);
  }
  if (used.size === 0) return pick();

  for (let i = 0; i < 40; i++) {
    const candidate = pick();
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  // Pool exhausted (or very unlucky) — number it rather than spin.
  const base = pick();
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/**
 * @deprecated Import `generateCampaignName` instead. Kept so the old import
 * path in `lib/util/campaign-name.ts` can re-export rather than hold a second
 * word list — one list, one behaviour.
 */
export const randomCampaignName = generateCampaignName;
