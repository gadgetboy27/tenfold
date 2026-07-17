import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * P2.2 — OAuth tokens must never reach the browser.
 *
 * They did. `authenticated` held a TABLE-level SELECT on social_profiles and
 * social_profiles_select_member lets any member read their workspace's rows, so
 * a signed-in browser fetching ?select=platform,access_token got the token back
 * in plaintext. Proven against the live database, then fixed and re-proven:
 * the same request now returns 42501 permission denied.
 *
 * The blast radius is why this mattered. Meta Page tokens never expire, so one
 * XSS or one stolen session escalated from "read their tenfold data" to
 * permanent control of their Facebook Page — and refresh tokens mint fresh
 * access to LinkedIn, TikTok and Reddit indefinitely, long after the session
 * is gone.
 *
 * These guard the two ways it could come back: a client-facing route selecting
 * the columns, or a migration re-granting the table.
 */

const SECRETS = ["access_token", "refresh_token"];

/**
 * Source with comments removed. These assertions are about what the CODE does,
 * and the files deliberately document the very leaks being asserted against —
 * matching raw text fails on the warning rather than the bug.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("the client-facing profiles route", () => {
  const route = code("app/api/social/profiles/route.ts");

  it("names its columns instead of using select(*)", () => {
    // `select('*')` would ship whatever columns exist today AND whatever gets
    // added tomorrow — which is how a secret leaks without anyone editing this
    // file.
    expect(route).toMatch(/\.select\(\s*['"][^*]+['"]\s*\)/);
    expect(route).not.toMatch(/\.select\(\s*['"]\*['"]\s*\)/);
  });

  it("never selects a token column", () => {
    const select = /\.select\(\s*['"]([^'"]+)['"]\s*\)/.exec(route)?.[1] ?? "";
    for (const s of SECRETS) {
      expect(select, `${s} is being sent to the client`).not.toContain(s);
    }
  });
});

describe("the token grant migration", () => {
  const raw = readFileSync(
    "db/migrations/0018_keep_social_tokens_off_the_client.sql",
    "utf8",
  );
  // Strip `--` comments: the file EXPLAINS the broken column-level revoke, and
  // matching prose would fail on the very warning that documents the trap.
  const sql = raw
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  it("revokes the TABLE grant, not just the columns", () => {
    // The trap: Postgres checks the table-level grant first, so
    // `REVOKE SELECT (access_token)` against a table-wide GRANT is silently a
    // no-op. The first attempt at this migration did exactly that, reported
    // success, and the token still came back.
    expect(sql).toMatch(
      /REVOKE\s+SELECT[^(]*ON\s+public\.social_profiles\s+FROM\s+authenticated/i,
    );
    expect(sql).not.toMatch(/REVOKE\s+SELECT\s*\(\s*access_token/i);
  });

  it("re-grants only the columns the UI needs", () => {
    const grant =
      /GRANT SELECT \(([\s\S]*?)\) ON public\.social_profiles/i.exec(
        sql,
      )?.[1] ?? "";
    expect(grant).toContain("platform");
    expect(grant).toContain("handle");
    for (const s of SECRETS) {
      expect(grant, `${s} was re-granted to the browser`).not.toContain(s);
    }
  });

  it("grants nothing at all to anon", () => {
    // A logged-out visitor has no business reading social_profiles.
    expect(sql).toMatch(/REVOKE[\s\S]*FROM\s+anon/i);
    expect(sql).not.toMatch(/GRANT[\s\S]*TO\s+anon/i);
  });

  it("leaves writes to the service role", () => {
    // Every write (OAuth callback, refresh, Page switch) is server-side.
    expect(sql).toMatch(/REVOKE\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE/i);
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE)/i);
  });
});

describe("schema drift", () => {
  it("ships a migration for every token column the code reads", () => {
    // db/schema.ts declared refresh_token and token_expires_at from the start;
    // the live table never had them, and nothing noticed because Meta Page
    // tokens never expire so nothing ever read them. The refresh layer does —
    // it would have failed at runtime the moment LinkedIn connected.
    const migration = readFileSync(
      "db/migrations/0017_social_profiles_token_refresh_columns.sql",
      "utf8",
    );
    for (const col of ["refresh_token", "token_expires_at"]) {
      expect(migration).toContain(col);
    }
  });
});

describe("the public health endpoint", () => {
  const route = code("app/api/health/route.ts");

  it("leaks no identifying detail", () => {
    // It used to return the DB host, DB username, Supabase project URL, row
    // counts, and every workspace slug — real customer names — to anyone who
    // curled it, with no session required. Reachability is the only question a
    // health check asks.
    for (const leak of [
      "slug",
      "dbHost",
      "dbUser",
      "DATABASE_URL",
      "rowCount",
      "TEST_WORKSPACE",
    ]) {
      expect(route, `health endpoint still exposes ${leak}`).not.toContain(
        leak,
      );
    }
  });

  it("reports booleans, not values", () => {
    // "configured: true" is safe; echoing the key or the project URL is not.
    expect(route).toMatch(/status:\s*ok\s*\?/);
    expect(route).not.toMatch(/supabaseUrl\s*\|\|\s*["']MISSING/);
  });

  it("stays 200 so the container healthcheck cannot restart-loop", () => {
    // Dockerfile HEALTHCHECK fails the container on a non-200, and restarting
    // this app cannot fix someone else's database being down.
    expect(route).not.toMatch(/status:\s*5\d\d/);
  });
});
