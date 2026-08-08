/**
 * Free credits granted on signup — the single source of truth.
 *
 * Lives here, not in `lib/auth/provisioning.ts`, because marketing copy needs
 * it and provisioning pulls in the service-role admin client. A `"use client"`
 * component importing that would drag server-only code into the browser
 * bundle — the same boundary `lib/credits/CLAUDE.md` documents for the
 * Anthropic client.
 *
 * Raised 50 → 150 (2026-08-09): 50 didn't cover a single video (`video_10s` is
 * 62 on its own), so a new account could not reach the product's headline
 * outcome before hitting a paywall.
 *
 * **Never retype this number in copy.** It was hardcoded in nine places —
 * three CTA buttons, the FAQ (twice, once for the visible answer and once for
 * its JSON-LD), the site metadata, the pricing page, and a guide — and every
 * one of them would have silently kept saying "50" after this change.
 */
export const WELCOME_CREDITS = 150;
