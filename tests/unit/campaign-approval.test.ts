import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * campaigns.approval_status gates publishing for `member` users. The three
 * workflow routes each guard one edge of draft → pending_review → approved
 * with an atomic conditional UPDATE, so these assert the filters that make the
 * edge legal, the role gate that makes it owner/admin-only, and that a refused
 * call writes nothing. The publish gate lives in a 700-line route, so it is
 * pinned structurally (same approach as tiktok-publish.test.ts).
 */

type Role = "owner" | "admin" | "member";
interface Call {
  method: string;
  args: unknown[];
}

let role: Role = "member";
let calls: Call[] = [];
let result: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};

function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq", "neq"]) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b.maybeSingle = () => Promise.resolve(result);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => builder(),
    rpc: () => undefined,
    storage: {},
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({
    userId: "user-1",
    workspaceId: "ws-1",
    role,
  }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: () => "k",
  checkRateLimit: () => true,
}));

const ctx = { params: Promise.resolve({ id: "camp-1" }) };
const req = () => new Request("http://x", { method: "POST" });
const filters = () =>
  calls.filter((c) => c.method === "eq" || c.method === "neq");
const updates = () => calls.filter((c) => c.method === "update");
const row = (status: string) => ({
  data: { id: "camp-1", approval_status: status },
  error: null,
});

beforeEach(() => {
  role = "member";
  calls = [];
  result = { data: null, error: null };
});

describe("submit-review (draft → pending_review)", () => {
  it.each<Role>(["member", "admin", "owner"])(
    "lets a %s submit, only from draft",
    async (r) => {
      role = r;
      result = row("pending_review");
      const { POST } =
        await import("@/app/api/campaigns/[id]/submit-review/route");
      const res = await POST(req(), ctx);
      expect(res.status).toBe(200);
      expect(updates()[0].args[0]).toMatchObject({
        approval_status: "pending_review",
      });
      expect(filters()).toContainEqual({
        method: "eq",
        args: ["approval_status", "draft"],
      });
      expect(filters()).toContainEqual({
        method: "eq",
        args: ["id", "camp-1"],
      });
    },
  );

  it("404s when the campaign isn't in draft (already pending/approved)", async () => {
    const { POST } =
      await import("@/app/api/campaigns/[id]/submit-review/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("is scoped to the caller's workspace", async () => {
    result = row("pending_review");
    const { POST } =
      await import("@/app/api/campaigns/[id]/submit-review/route");
    await POST(req(), ctx);
    expect(filters()).toContainEqual({
      method: "eq",
      args: ["workspace_id", "ws-1"],
    });
  });

  it("surfaces a database error as 500", async () => {
    result = { data: null, error: { message: "boom" } };
    const { POST } =
      await import("@/app/api/campaigns/[id]/submit-review/route");
    expect((await POST(req(), ctx)).status).toBe(500);
  });
});

describe("approve (draft | pending_review → approved)", () => {
  it("refuses a member with 403 and writes nothing", async () => {
    role = "member";
    const { POST } = await import("@/app/api/campaigns/[id]/approve/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(updates()).toEqual([]);
  });

  it.each<Role>(["owner", "admin"])(
    "lets a %s approve, recording who and when",
    async (r) => {
      role = r;
      result = {
        data: {
          id: "camp-1",
          approval_status: "approved",
          approved_by: "user-1",
          approved_at: "t",
        },
        error: null,
      };
      const { POST } = await import("@/app/api/campaigns/[id]/approve/route");
      const res = await POST(req(), ctx);
      expect(res.status).toBe(200);
      const set = updates()[0].args[0] as Record<string, unknown>;
      expect(set).toMatchObject({
        approval_status: "approved",
        approved_by: "user-1",
      });
      expect(typeof set.approved_at).toBe("string");
    },
  );

  it("is legal from draft (self-approve) — filters only out 'already approved'", async () => {
    role = "owner";
    result = row("approved");
    const { POST } = await import("@/app/api/campaigns/[id]/approve/route");
    await POST(req(), ctx);
    expect(filters()).toContainEqual({
      method: "neq",
      args: ["approval_status", "approved"],
    });
    expect(filters()).not.toContainEqual({
      method: "eq",
      args: ["approval_status", "draft"],
    });
  });

  it("404s on an already-approved campaign rather than re-stamping approved_by", async () => {
    role = "admin";
    const { POST } = await import("@/app/api/campaigns/[id]/approve/route");
    expect((await POST(req(), ctx)).status).toBe(404);
  });
});

describe("reject (pending_review → draft)", () => {
  it("refuses a member with 403 and writes nothing", async () => {
    role = "member";
    const { POST } = await import("@/app/api/campaigns/[id]/reject/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(updates()).toEqual([]);
  });

  it.each<Role>(["owner", "admin"])(
    "lets a %s send it back to draft and clears the sign-off",
    async (r) => {
      role = r;
      result = row("draft");
      const { POST } = await import("@/app/api/campaigns/[id]/reject/route");
      const res = await POST(req(), ctx);
      expect(res.status).toBe(200);
      expect(updates()[0].args[0]).toMatchObject({
        approval_status: "draft",
        approved_by: null,
        approved_at: null,
      });
      expect(filters()).toContainEqual({
        method: "eq",
        args: ["approval_status", "pending_review"],
      });
    },
  );

  it("404s when the campaign isn't pending review (can't un-approve via reject)", async () => {
    role = "owner";
    const { POST } = await import("@/app/api/campaigns/[id]/reject/route");
    expect((await POST(req(), ctx)).status).toBe(404);
  });
});

describe("POST /api/publish approval gate (structural)", () => {
  const src = readFileSync(
    join(process.cwd(), "app/api/publish/route.ts"),
    "utf8",
  );
  const start = src.indexOf("Approval gate (PRODUCT_STRATEGY.md");
  const gate = src.slice(start, start + 1400);

  it("exists", () => {
    expect(start).toBeGreaterThan(-1);
  });

  it("exempts owner and admin and nobody else", () => {
    expect(gate).toContain('session.role !== "owner"');
    expect(gate).toContain('session.role !== "admin"');
  });

  it("blocks anything other than 'approved' with a 403", () => {
    expect(gate).toContain('approvalStatus !== "approved"');
    expect(gate).toContain("status: 403");
  });

  it("reads the status from campaigns, not from the request body", () => {
    expect(gate).toMatch(/from\("campaigns"\)\s*\.select\("approval_status"\)/);
  });

  it("runs before the first platform call", () => {
    const firstCall = src.indexOf("await publishToFacebook(");
    expect(firstCall).toBeGreaterThan(-1);
    expect(start).toBeLessThan(firstCall);
  });
});
