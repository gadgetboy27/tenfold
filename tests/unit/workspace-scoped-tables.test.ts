import { describe, it, expect } from "vitest";
import { WORKSPACE_SCOPED_TABLES } from "@/lib/api/with-workspace";

/**
 * Every public table carrying a `workspace_id` must be registered for scoping.
 *
 * The service-role client bypasses RLS, so tenant isolation depends entirely on
 * this list: registered tables get `workspace_id` injected on write and
 * filtered on read, automatically. A table that has the column but is missing
 * here fails twice — writes omit the value (a NOT NULL violation if you're
 * lucky, a row with the wrong owner if you're not) and reads return every
 * workspace's rows.
 *
 * That is exactly what happened with `campaign_runs`: its INSERT relied on
 * injection, hit the NOT NULL constraint, and on investigation SIX tables
 * turned out to be unregistered — including `brand_kits`, whose reads were
 * therefore unfiltered across tenants.
 *
 * The expected list below was taken from information_schema on 2026-08-09:
 *
 *   select c.table_name from information_schema.columns c
 *   join information_schema.tables t using (table_schema, table_name)
 *   where c.table_schema='public' and c.column_name='workspace_id'
 *     and t.table_type='BASE TABLE';
 *
 * When a migration adds a workspace-scoped table, add it in both places. This
 * test failing is the reminder.
 */
const TABLES_WITH_WORKSPACE_ID = [
  "asset_comments",
  "assets",
  "brand_kits",
  "campaign_runs",
  "campaigns",
  "compositions",
  "creative_jobs",
  "credit_accounts",
  "credit_transactions",
  "decision_events",
  "logo_projects",
  "promo_redemptions",
  "publish_attempts",
  "publish_records",
  "social_profiles",
  "subscriptions",
  "workspace_addons",
  "workspace_members",
] as const;

describe("WORKSPACE_SCOPED_TABLES", () => {
  it.each(TABLES_WITH_WORKSPACE_ID)("scopes %s", (table) => {
    expect(
      WORKSPACE_SCOPED_TABLES.has(table),
      `${table} has a workspace_id column but is not registered — its writes ` +
        `will omit workspace_id and its reads will span every tenant`,
    ).toBe(true);
  });

  it("excludes `workspaces` itself", () => {
    // Its identity column is `id`, not `workspace_id`; scoping it would filter
    // on a column that doesn't exist.
    expect(WORKSPACE_SCOPED_TABLES.has("workspaces")).toBe(false);
  });

  it("registers the tables the foreman writes", () => {
    // campaign_runs is the one that broke; decision_events shipped alongside it.
    expect(WORKSPACE_SCOPED_TABLES.has("campaign_runs")).toBe(true);
    expect(WORKSPACE_SCOPED_TABLES.has("decision_events")).toBe(true);
  });
});
