import { CREDIT_COSTS } from "@/lib/credits/costs";
/**
 * How healthy a credit balance is — the single source of truth for every
 * low-credit warning in the UI.
 *
 * Thresholds are ABSOLUTE, not a percentage of some plan allowance, because
 * the costs they're measured against are absolute: a 30s video is 169 credits
 * and an image grid is 12 (lib/credits/costs.ts) whatever you pay per month.
 * The only question a credit meter has to answer is "can I afford my next
 * action?", and that question has the same answer on every tier.
 *
 * This lives here because the sidebar and the top-bar meter used to each carry
 * their own rule — one a percentage of a hardcoded 500-credit ceiling that no
 * plan actually has, the other these thresholds. They disagreed on screen at
 * the same time: 75 credits rendered red in one and amber in the other.
 */

/** Below this you can't afford a 10s video (56) and are four image grids from
 *  zero — genuinely nearly empty, whatever you were planning to make. */
export const CREDIT_LOW = 50;

/**
 * Below this you can no longer afford the most expensive single action.
 *
 * DERIVED, not a magic number. It was hardcoded at 150 and repricing video
 * (30s: 100 → 169) silently pushed the priciest action above the "you're fine"
 * line — so the gauge would have read green to someone who could not actually
 * make the thing they came for. Deriving it means a reprice moves the warning
 * with it, which is the only way this stays true without anyone remembering.
 */
export const CREDIT_WARNING = Math.max(...Object.values(CREDIT_COSTS));

export type CreditLevel = "low" | "warning" | "ok";

export function creditLevel(balance: number): CreditLevel {
  if (balance < CREDIT_LOW) return "low";
  if (balance < CREDIT_WARNING) return "warning";
  return "ok";
}

/**
 * Fill fraction (0–1) for a credit gauge.
 *
 * Denominated against CREDIT_WARNING, so this is a fuel light rather than a
 * usage report: it reads full until you enter the last stretch, then drains in
 * step with the colour. That's deliberate — denominating against a monthly
 * allowance meant a Creator who had just paid opened the sidebar to a bar
 * already at 70% having used nothing, and left Agency pinned at 100% forever.
 */
export function creditFillFraction(balance: number): number {
  return Math.min(1, Math.max(0, balance / CREDIT_WARNING));
}
