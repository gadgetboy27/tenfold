import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test for the credit-costing vision auto-fix route
 * (CLAUDE.md §7: every credit debit path must have an integration test; failed
 * jobs must refund atomically). Exercises the REAL debitCredits/refundCredits
 * modules and the route's ordering — only the external boundaries (session,
 * Supabase admin client, Claude, rate-limit) are mocked, backed by a stateful
 * fake ledger so we can assert charged vs. refunded per outcome.
 */

const COST = 3; // CREDIT_COSTS.layout_autofix

// ── Stateful fake ledger + admin client ──────────────────────────────────────
interface Ledger {
  balance: number;
  debits: number;
  refunds: number;
}
let ledger: Ledger;
// Per-table result the fake query builder resolves to.
let campaignRow: { id: string } | null;
let jobInsertError: { message: string } | null;

function makeBuilder(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "order",
    "limit",
  ]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  // Makes `await builder` (insert/update chains) resolve to the table result.
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

const admin = {
  from(table: string) {
    if (table === "campaigns")
      return makeBuilder({ data: campaignRow, error: null });
    if (table === "creative_jobs")
      return makeBuilder({ data: null, error: jobInsertError });
    return makeBuilder({ data: null, error: null });
  },
  rpc(name: string) {
    if (name === "debit_credits") {
      if (ledger.balance < COST) {
        return Promise.resolve({
          data: {
            success: false,
            balance: ledger.balance,
            reason: "Insufficient credits",
          },
          error: null,
        });
      }
      ledger.balance -= COST;
      ledger.debits += 1;
      return Promise.resolve({
        data: { success: true, balance: ledger.balance },
        error: null,
      });
    }
    if (name === "refund_credits") {
      ledger.balance += COST;
      ledger.refunds += 1;
      return Promise.resolve({
        data: { success: true, balance: ledger.balance },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  },
  storage: {},
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => admin,
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: () => Promise.resolve({ workspaceId: "ws-1", userId: "u-1" }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: () => "test",
  checkRateLimit: () => true,
}));

// Claude vision — configurable per test (resolve adjustments or throw).
const autofixLayout = vi.fn();
vi.mock("@/lib/claude/autofix", () => ({
  autofixLayout: (...a: unknown[]) => autofixLayout(...a),
}));

const CAMPAIGN = "5b0c8f6e-2a1d-4e3b-9c7f-1234567890ab";
const body = {
  campaignId: CAMPAIGN,
  aspect: "9:16",
  platformLabel: "TikTok",
  image: "data:image/png;base64,AAAA",
  layers: [{ id: "l1", kind: "text", nx: 0.5, ny: 0.9, hw: 0.3, hh: 0.05 }],
  zones: [{ label: "caption", x: 0, y: 0.8, w: 0.85, h: 0.2 }],
};

function post(overrides: Record<string, unknown> = {}) {
  return new Request("http://t/api/compositions/autofix", {
    method: "POST",
    body: JSON.stringify({ ...body, ...overrides }),
  });
}

describe("POST /api/compositions/autofix — credit safety", () => {
  beforeEach(() => {
    ledger = { balance: 10, debits: 0, refunds: 0 };
    campaignRow = { id: CAMPAIGN };
    jobInsertError = null;
    autofixLayout.mockReset();
  });

  it("charges once on a successful fix", async () => {
    autofixLayout.mockResolvedValue([{ layerId: "l1", nx: 0.5, ny: 0.6 }]);
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.adjustments).toHaveLength(1);
    expect(ledger.debits).toBe(1);
    expect(ledger.refunds).toBe(0);
    expect(ledger.balance).toBe(7); // charged 3
  });

  it("refunds atomically when the vision call fails (net zero)", async () => {
    autofixLayout.mockRejectedValue(new Error("Claude timeout"));
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post());

    expect(res.status).toBe(500);
    expect(ledger.debits).toBe(1);
    expect(ledger.refunds).toBe(1);
    expect(ledger.balance).toBe(10); // charged then refunded → net zero
  });

  it("refunds when the model returns no changes (no charge for a no-op)", async () => {
    autofixLayout.mockResolvedValue([]);
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.refunded).toBe(true);
    expect(ledger.balance).toBe(10); // net zero
  });

  it("refunds a non-empty but EFFECTLESS response (schema-valid no-op)", async () => {
    // {layerId} only — valid, but carries no pos/scale → the client would apply
    // nothing. The server must gate on effective value, not array length.
    autofixLayout.mockResolvedValue([{ layerId: "l1" }]);
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post());

    const json = await res.json();
    expect(json.refunded).toBe(true);
    expect(ledger.balance).toBe(10); // net zero — not charged for a no-op
  });

  it("refunds when adjustments target only unknown layers", async () => {
    autofixLayout.mockResolvedValue([{ layerId: "ghost", nx: 0.5, ny: 0.5 }]);
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post());

    const json = await res.json();
    expect(json.refunded).toBe(true);
    expect(ledger.balance).toBe(10);
  });

  it("returns 402 and never charges or calls Claude on insufficient credits", async () => {
    ledger.balance = 1; // < COST
    autofixLayout.mockResolvedValue([{ layerId: "l1", nx: 0.5, ny: 0.6 }]);
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post());

    expect(res.status).toBe(402);
    expect(autofixLayout).not.toHaveBeenCalled();
    expect(ledger.balance).toBe(1); // untouched
    expect(ledger.refunds).toBe(0);
  });

  it("404s without any debit when the campaign is not in the workspace", async () => {
    campaignRow = null; // scoped lookup finds nothing
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post());

    expect(res.status).toBe(404);
    expect(ledger.debits).toBe(0);
    expect(autofixLayout).not.toHaveBeenCalled();
  });

  it("500s without any debit when the job row fails to insert", async () => {
    jobInsertError = { message: "fk violation" };
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post());

    expect(res.status).toBe(500);
    // The job row must exist before we debit, so an insert failure never charges.
    expect(ledger.debits).toBe(0);
    expect(ledger.balance).toBe(10);
    expect(autofixLayout).not.toHaveBeenCalled();
  });

  it("rejects a malformed body before touching credits", async () => {
    const { POST } = await import("@/app/api/compositions/autofix/route");
    const res = await POST(post({ layers: [] })); // min(1) violated

    expect(res.status).toBe(400);
    expect(ledger.debits).toBe(0);
  });
});
