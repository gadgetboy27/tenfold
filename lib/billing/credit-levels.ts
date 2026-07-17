/**
 * How healthy a credit balance is — the single source of truth for every
 * low-credit warning in the UI.
 *
 * Thresholds are ABSOLUTE, not a percentage of some plan allowance, because
 * the costs they're measured against are absolute: a 30s video is 100 credits
 * and an image grid is 12 (lib/credits/costs.ts) whatever you pay per month.
 * The only question a credit meter has to answer is "can I afford my next
 * action?", and that question has the same answer on every tier.
 *
 * This lives here because the sidebar and the top-bar meter used to each carry
 * their own rule — one a percentage of a hardcoded 500-credit ceiling that no
 * plan actually has, the other these thresholds. They disagreed on screen at
 * the same time: 75 credits rendered red in one and amber in the other.
 */

/** Below this you cannot afford a 30s video (100) and are two image grids from zero. */
export const CREDIT_LOW = 50;
/** Below this you are inside the last 30s video's worth of runway. */
export const CREDIT_WARNING = 150;

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
