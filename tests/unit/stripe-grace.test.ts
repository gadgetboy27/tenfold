import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isEntitled } from "@/lib/billing/entitlements";
import { PAYMENT_GRACE_DAYS } from "@/lib/stripe/webhooks";

/**
 * P1.3 — a failed payment must not be an instant downgrade.
 *
 * Stripe flips a subscription to past_due the moment a renewal card is
 * declined, and customer.subscription.updated writes that straight through.
 * Honouring only active/trialing therefore yanked a paying customer's tier
 * mid-work — usually for nothing worse than an expired card, and before any
 * dunning email had arrived. Stripe retries for days; we now hold the tier for
 * the same window.
 */

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe("entitlement during a failed payment", () => {
  it("honours an active or trialing subscription", () => {
    expect(isEntitled({ status: "active" })).toBe(true);
    expect(isEntitled({ status: "trialing" })).toBe(true);
  });

  it("keeps the tier while past_due is still inside its grace window", () => {
    expect(isEntitled({ status: "past_due", grace_until: days(3) })).toBe(true);
  });

  it("drops the tier once grace has run out", () => {
    expect(isEntitled({ status: "past_due", grace_until: days(-1) })).toBe(
      false,
    );
  });

  it("gives no grace to a past_due row that never got a window", () => {
    // Fails CLOSED. Subscriptions predating the grace_until column must not get
    // an unbounded free ride just because the field is null.
    expect(isEntitled({ status: "past_due", grace_until: null })).toBe(false);
    expect(isEntitled({ status: "past_due" })).toBe(false);
  });

  it("ignores grace for any status other than past_due", () => {
    // A cancelled subscription with a stale window must not resurrect itself.
    expect(isEntitled({ status: "canceled", grace_until: days(5) })).toBe(
      false,
    );
    expect(
      isEntitled({ status: "incomplete_expired", grace_until: days(5) }),
    ).toBe(false);
    expect(isEntitled({ status: "unpaid", grace_until: days(5) })).toBe(false);
  });

  it("treats a missing subscription as unentitled", () => {
    expect(isEntitled(null)).toBe(false);
  });

  it("survives a corrupt timestamp without granting access", () => {
    expect(isEntitled({ status: "past_due", grace_until: "not-a-date" })).toBe(
      false,
    );
  });

  it("uses a window Stripe's dunning can actually finish inside", () => {
    // Shorter than Stripe's retry schedule would downgrade someone whose
    // payment was still going to succeed.
    expect(PAYMENT_GRACE_DAYS).toBeGreaterThanOrEqual(3);
    expect(PAYMENT_GRACE_DAYS).toBeLessThanOrEqual(30);
  });
});

describe("webhook idempotency", () => {
  const route = readFileSync("app/api/webhooks/stripe/route.ts", "utf8");
  const handlers = readFileSync("lib/stripe/webhooks.ts", "utf8");

  it("only marks an event processed when it actually succeeded", () => {
    // The bug: `processed: true` was written unconditionally, so a failed
    // attempt looked handled. Stripe's retry then hit the duplicate guard and
    // was answered ok — losing the event, and with it the customer's credits.
    expect(route).toContain("processed: !processingError");
    expect(route).not.toMatch(/update\(\{\s*processed:\s*true/);
  });

  it("retries a duplicate that was never successfully processed", () => {
    // A duplicate is only safe to skip if the first attempt WORKED.
    expect(route).toMatch(/select\(["']processed["']\)/);
    expect(route).toMatch(/\?\.processed/);
  });

  it("still logs before processing", () => {
    // CLAUDE.md §5 — the log must survive a crash mid-handler.
    expect(route.indexOf("webhook_logs")).toBeLessThan(
      route.indexOf("handleStripeEvent(event)"),
    );
  });

  it("handles the payment lifecycle events the plan requires", () => {
    for (const evt of [
      "checkout.session.completed", // top-up success
      "invoice.payment_succeeded", // renewal success
      "invoice.payment_failed", // renewal failure → grace
      "customer.subscription.deleted", // cancellation → downgrade
    ]) {
      expect(handlers, `${evt} is unhandled`).toContain(`"${evt}"`);
    }
  });

  it("resolves grace through one helper on every path", () => {
    // payment_failed and subscription.updated BOTH fire on a decline, in no
    // guaranteed order. Two copies of the window logic would race each other:
    // updated landing first with no window is an instant downgrade until
    // payment_failed catches up.
    expect(handlers).toContain("resolveGrace");
    const paths = handlers.match(/resolveGrace\(/g) ?? [];
    expect(paths.length).toBeGreaterThanOrEqual(3); // definition + both callers
  });

  it("clears grace once the subscription is healthy again", () => {
    // Otherwise a spent window looks open the next time a card fails, the
    // handler declines to start a fresh one, and the customer is downgraded
    // on the first decline instead of after seven days.
    expect(handlers).toMatch(/grace_until:\s*null/);
  });
});
