import { describe, it, expect } from "vitest";
import {
  createScopedClient,
  WORKSPACE_SCOPED_TABLES,
} from "@/lib/api/with-workspace";

type Call = { method: string; args: unknown[] };

interface FakeBuilder {
  select: (...a: unknown[]) => FakeBuilder;
  insert: (...a: unknown[]) => FakeBuilder;
  update: (...a: unknown[]) => FakeBuilder;
  delete: (...a: unknown[]) => FakeBuilder;
  upsert: (...a: unknown[]) => FakeBuilder;
  eq: (...a: unknown[]) => FakeBuilder;
}

function makeBuilder(calls: Call[]): FakeBuilder {
  const builder = {} as FakeBuilder;
  for (const m of [
    "select",
    "insert",
    "update",
    "delete",
    "upsert",
    "eq",
  ] as const) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    };
  }
  return builder;
}

type AdminArg = Parameters<typeof createScopedClient>[0];

function fakeAdmin(calls: Call[]): AdminArg {
  return {
    from: () => makeBuilder(calls),
    rpc: () => undefined,
    storage: {},
  } as unknown as AdminArg;
}

const WS = "ws-123";

describe("createScopedClient", () => {
  it("appends .eq(workspace_id) to selects on scoped tables", () => {
    const calls: Call[] = [];
    const db = createScopedClient(fakeAdmin(calls), WS);
    db.from("campaigns").select("*");

    const eq = calls.find((c) => c.method === "eq");
    expect(eq).toBeDefined();
    expect(eq?.args).toEqual(["workspace_id", WS]);
  });

  it("injects workspace_id into inserts on scoped tables", () => {
    const calls: Call[] = [];
    const db = createScopedClient(fakeAdmin(calls), WS);
    db.from("assets").insert({ url: "x" });

    const insert = calls.find((c) => c.method === "insert");
    expect(insert?.args[0]).toMatchObject({ url: "x", workspace_id: WS });
  });

  it("injects workspace_id into every row of a bulk insert", () => {
    const calls: Call[] = [];
    const db = createScopedClient(fakeAdmin(calls), WS);
    db.from("credit_transactions").insert([{ amount: 1 }, { amount: 2 }]);

    const insert = calls.find((c) => c.method === "insert");
    expect(insert?.args[0]).toEqual([
      { amount: 1, workspace_id: WS },
      { amount: 2, workspace_id: WS },
    ]);
  });

  it("does NOT scope tables without a workspace_id column", () => {
    const calls: Call[] = [];
    const db = createScopedClient(fakeAdmin(calls), WS);
    // webhook_logs is not in WORKSPACE_SCOPED_TABLES
    db.from("webhook_logs").select("*");

    expect(calls.find((c) => c.method === "eq")).toBeUndefined();
  });

  it("keeps the workspaces table unscoped (identity is id, not workspace_id)", () => {
    expect(WORKSPACE_SCOPED_TABLES.has("workspaces")).toBe(false);
  });

  it("scopes the asset_comments table", () => {
    expect(WORKSPACE_SCOPED_TABLES.has("asset_comments")).toBe(true);
  });
});
