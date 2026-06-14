const ADJECTIVES = [
  "Bold",
  "Bright",
  "Golden",
  "Electric",
  "Velvet",
  "Crimson",
  "Midnight",
  "Sunlit",
  "Wild",
  "Neon",
  "Coastal",
  "Urban",
  "Radiant",
  "Quiet",
  "Stellar",
  "Amber",
];

const NOUNS = [
  "Launch",
  "Story",
  "Pulse",
  "Spark",
  "Wave",
  "Drop",
  "Vision",
  "Moment",
  "Anthem",
  "Canvas",
  "Signal",
  "Horizon",
  "Reel",
  "Frame",
  "Echo",
  "Bloom",
];

/** A friendly random campaign name, e.g. "Golden Pulse". */
export function randomCampaignName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a} ${n}`;
}
