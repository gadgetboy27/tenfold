import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * P1.2 — credit metering integrity, enforced structurally.
 *
 * The race condition is already handled: debit_credits() takes a row lock
 * (SELECT ... FOR UPDATE), and 20 concurrent 12-credit debits against a
 * 100-credit balance were verified against the live database to grant exactly
 * 8 and never go negative.
 *
 * The leak was elsewhere and quieter. Two routes debited credits, then threw if
 * the creative_jobs insert failed — charging for a job that never existed. With
 * no job row, nothing downstream could refund it either: refundCredits() keys
 * off the job, and the webhook that would normally refund a failure never fires
 * for a job that was never enqueued. The credits were simply gone.
 *
 * These read the source because that is where the invariant lives — mocking the
 * DB would only prove the mock refunds.
 */

function apiRoutes(dir = "app/api"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...apiRoutes(p));
    else if (entry === "route.ts") out.push(p);
  }
  return out;
}

/** Routes that take money before creating the job they charged for. */
const debitRoutes = apiRoutes().filter((p) => {
  const s = readFileSync(p, "utf8");
  return /debitCredits(Amount)?\s*\(/.test(s) && /from\(["']creative_jobs["']\)\s*[\s\S]{0,40}\.insert/.test(s);
});

describe("credit integrity", () => {
  it("finds the routes that debit and create jobs", () => {
    // If this drops to zero the audit below is silently vacuous.
    expect(debitRoutes.length).toBeGreaterThan(0);
  });

  it("never abandons a debit when the job row fails to insert", () => {
    const leaking: string[] = [];

    for (const path of debitRoutes) {
      const src = readFileSync(path, "utf8");
      const debitAt = src.search(/debitCredits(Amount)?\s*\(/);
      const insertAt = src.search(/from\(["']creative_jobs["']\)\s*[\s\S]{0,40}\.insert/);

      // Inserting BEFORE debiting is the stronger pattern — a failed insert
      // can't strand a charge that hasn't happened yet (see
      // app/api/compositions/autofix/route.ts). Nothing to check.
      if (insertAt < debitAt) continue;

      // Otherwise the insert's error branch must refund before it bails.
      const after = src.slice(insertAt);
      const errBranch = /if\s*\(\s*\w*[Ee]rr\w*\s*\)\s*\{([\s\S]{0,600}?)\}/.exec(after);
      const inline = /if\s*\(\s*\w*[Ee]rr\w*\s*\)\s*(throw|return)[^\n]*/.exec(after);

      const refunds = errBranch ? /refundCredits\s*\(/.test(errBranch[1]) : false;
      // A single-line `if (jobErr) throw ...` cannot refund by construction.
      const bailsWithoutRefund = !!inline && (!errBranch || inline.index < errBranch.index);

      if (bailsWithoutRefund || !refunds) leaking.push(path);
    }

    expect(
      leaking,
      `these debit credits then throw away the charge if the job insert fails:\n  ${leaking.join("\n  ")}`,
    ).toEqual([]);
  });
});

describe("the debit RPC itself", () => {
  const sql = readFileSync("db/migrations/0003_atomic_credit_debit.sql", "utf8");

  it("locks the account row before reading the balance", () => {
    // Without FOR UPDATE, two concurrent debits both read the old balance and
    // both pass the affordability check — the classic overdraft. Verified live:
    // 20 concurrent debits of 12 against 100 granted exactly 8.
    expect(sql).toMatch(/SELECT\s+cached_balance[\s\S]*?FOR UPDATE/i);
  });

  it("refuses to debit more than the balance", () => {
    expect(sql).toMatch(/IF\s+v_new_balance\s*<\s*p_cost/i);
  });

  it("writes the ledger row and the cached balance together", () => {
    // CLAUDE.md §2: the ledger is the truth and cached_balance is a cache. They
    // must move in the same transaction or the cache drifts from the sum.
    expect(sql).toMatch(/INSERT INTO credit_transactions/i);
    expect(sql).toMatch(/UPDATE credit_accounts/i);
  });
});
