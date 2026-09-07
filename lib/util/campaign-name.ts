/**
 * Re-export only — the word lists live in one place.
 *
 * This module used to carry its OWN 16×16 list while `lib/names/generator.ts`
 * carried a larger one, and Studio (the only live surface) imported this one.
 * 256 combinations is a near-certain collision across a real workspace, which
 * is how four projects ended up called "Amber Pulse". Two lists, one meaning,
 * and the weaker one won by import path.
 *
 * Kept as a file rather than deleted so existing imports keep working.
 */
export {
  generateCampaignName as randomCampaignName,
  NAME_COMBINATIONS,
} from "@/lib/names/generator";
