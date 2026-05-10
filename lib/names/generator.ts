const ADJECTIVES = [
  'Bold', 'Vivid', 'Golden', 'Silver', 'Crimson', 'Azure', 'Emerald', 'Midnight',
  'Solar', 'Lunar', 'Electric', 'Neon', 'Cosmic', 'Urban', 'Wild', 'Iconic',
  'Sharp', 'Fresh', 'Fierce', 'Bright', 'Pure', 'Epic', 'Swift', 'Stellar',
  'Dynamic', 'Radiant', 'Primal', 'Infinite', 'Summit', 'Onyx',
  'Cobalt', 'Ember', 'Iron', 'Jade', 'Amber', 'Crystal', 'Titan', 'Nova',
  'Velvet', 'Phantom', 'Apex', 'Neon', 'Obsidian', 'Prism', 'Zenith',
];

const NOUNS = [
  'Signal', 'Horizon', 'Spark', 'Wave', 'Launch', 'Motion', 'Impact', 'Vision',
  'Pulse', 'Drive', 'Edge', 'Reach', 'Current', 'Shift', 'Surge', 'Momentum',
  'Rise', 'Orbit', 'Flare', 'Echo', 'Burst', 'Bloom', 'Stride', 'Force',
  'Flow', 'Mark', 'Charge', 'Glow', 'Arc', 'Rush',
  'Crest', 'Peak', 'Tide', 'Thread', 'Drift', 'Beacon', 'Vector', 'Apex',
  'Current', 'Cipher', 'Canvas', 'Chapter', 'Circuit', 'Nexus', 'Prism',
];

export function generateCampaignName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}
