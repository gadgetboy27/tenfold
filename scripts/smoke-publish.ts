/**
 * P0.1 — end-to-end smoke test of the core promise:
 *
 *   signup → generate → connect a social account → publish → post is live
 *
 * Run against a real environment. It asserts the chain is INTACT, not that it
 * is merely typed: every check hits a live service or the live database.
 *
 *   npx tsx scripts/smoke-publish.ts            # read-only, safe any time
 *   npx tsx scripts/smoke-publish.ts --publish  # ALSO posts for real (see below)
 *
 * Read-only by default because the last step of the chain is a real post on a
 * real customer feed. --publish schedules one 2 days out, asserts Ayrshare
 * accepted it, then deletes it: the whole path exercised, nothing left behind.
 *
 * Why this exists: every fault this suite checks for was live in production and
 * invisible. Ayrshare had never published (its response contract is not the one
 * the docs describe), Instagram could never connect (the OAuth scope never
 * asked for it), and both failed silently — one of them reporting success.
 */

import { readFileSync } from "node:fs";
import { ayrsharePost, AyrsharePublishError } from "../lib/ayrshare/client";

/** Load .env without a dependency — dotenv is not in package.json and only
 *  resolved here transitively, which would break the moment that changed. */
function loadEnv(file = ".env") {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return; // CI/Railway inject real env vars; there is no file to read.
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) {
      process.env[k] = v.replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const PUBLISH = process.argv.includes("--publish");

type Check = { name: string; ok: boolean; detail: string; fatal?: boolean };
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail: string, fatal = false) =>
  checks.push({ name, ok, detail, fatal });

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  // ── 0. Config: the vars the chain cannot run without ─────────────────────
  // A missing key here surfaces deep inside a customer's OAuth click as the
  // string "undefined" in a URL, because nothing validates env at boot.
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "FAL_API_KEY",
    "AYRSHARE_API_KEY",
    "APP_URL",
  ]) {
    add(
      `env ${key}`,
      !!process.env[key],
      process.env[key] ? "set" : "MISSING",
      true,
    );
  }
  // Meta's pair gates Facebook AND Instagram; absent, connect is dead.
  for (const key of ["META_APP_ID", "META_APP_SECRET"]) {
    add(
      `env ${key}`,
      !!process.env[key],
      process.env[key] ? "set" : "MISSING (FB/IG connect will fail)",
    );
  }

  if (checks.some((c) => c.fatal && !c.ok)) return report();

  // ── 1. Signup → workspace provisioning ───────────────────────────────────
  const ws = await rest<Array<{ id: string; slug: string }>>(
    "workspaces?select=id,slug&limit=5",
  );
  add("signup → workspace exists", ws.length > 0, `${ws.length} workspace(s)`);

  const accounts = await rest<
    Array<{ workspace_id: string; cached_balance: number }>
  >("credit_accounts?select=workspace_id,cached_balance&limit=5");
  add(
    "signup → welcome credits granted",
    accounts.some((a) => a.cached_balance > 0),
    accounts.map((a) => a.cached_balance).join(", ") || "no accounts",
  );

  // ── 2. Generate → assets actually produced ───────────────────────────────
  const jobs = await rest<Array<{ status: string }>>(
    "creative_jobs?select=status&limit=200",
  );
  const done = jobs.filter((j) => j.status === "completed").length;
  add("generate → jobs complete", done > 0, `${done}/${jobs.length} completed`);

  const assets = await rest<Array<{ id: string; url: string; type: string }>>(
    "assets?select=id,url,type&type=eq.image&order=created_at.desc&limit=1",
  );
  add(
    "generate → image asset saved",
    assets.length > 0,
    assets[0]?.type ?? "none",
  );

  // ── 3. Media is publicly fetchable ───────────────────────────────────────
  // Every network pulls the media from this URL. A private bucket looks exactly
  // like a publish bug from the UI.
  if (assets[0]) {
    const head = await fetch(assets[0].url, { method: "GET" });
    add(
      "media is publicly reachable",
      head.ok,
      `HTTP ${head.status} ${head.headers.get("content-type") ?? ""}`,
    );
  }

  // ── 4. Connect → at least one social account is linked ───────────────────
  const profiles = await rest<
    Array<{ platform: string; access_token: string | null }>
  >("social_profiles?select=platform,access_token");
  add(
    "connect → Meta direct linked",
    profiles.length > 0,
    profiles.map((p) => p.platform).join(", ") || "none",
  );
  // Called out separately: Instagram is in the definition of done, and it
  // silently never connected because the OAuth scope omitted instagram_basic.
  add(
    "connect → Instagram linked",
    profiles.some((p) => p.platform === "instagram"),
    profiles.some((p) => p.platform === "instagram")
      ? "linked"
      : "NOT linked — reconnect Facebook, and check the Page has an IG Business account",
  );

  const wsKeys = await rest<
    Array<{ slug: string; ayrshare_profile_key: string | null }>
  >(
    "workspaces?select=slug,ayrshare_profile_key&ayrshare_profile_key=not.is.null&limit=1",
  );
  const profileKey = wsKeys[0]?.ayrshare_profile_key ?? null;
  add(
    "connect → Ayrshare profile provisioned",
    !!profileKey,
    profileKey ? wsKeys[0].slug : "none",
  );

  // ── 5. Ayrshare actually has networks linked ─────────────────────────────
  let linked: string[] = [];
  if (profileKey) {
    const u = (await fetch("https://app.ayrshare.com/api/user", {
      headers: {
        Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey,
      },
    }).then((r) => r.json())) as { activeSocialAccounts?: string[] };
    linked = u.activeSocialAccounts ?? [];
    add(
      "Ayrshare → networks linked",
      linked.length > 0,
      linked.join(", ") || "none",
    );
  }

  // ── 6. Publish → the real thing ──────────────────────────────────────────
  if (!PUBLISH) {
    add("publish → live post", true, "SKIPPED (pass --publish to exercise it)");
  } else if (!profileKey || linked.length === 0 || !assets[0]) {
    add(
      "publish → live post",
      false,
      "cannot run: no linked network or no asset",
    );
  } else {
    const platform = linked.includes("linkedin") ? "linkedin" : linked[0];
    const when = new Date(Date.now() + 2 * 864e5)
      .toISOString()
      .replace(/\.\d+Z$/, "Z");
    try {
      const r = await ayrsharePost(profileKey, {
        post: "Tenfold smoke test — scheduled and immediately deleted. Made by Tenfold.nz",
        platforms: [platform],
        mediaUrls: [assets[0].url],
        scheduleDate: when,
      });
      // Cancel it before it can reach anyone's feed.
      const del = (await fetch("https://app.ayrshare.com/api/post", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: r.id }),
      }).then((x) => x.json())) as { status?: string };
      add(
        `publish → ${platform} accepted + cleaned up`,
        !!r.id && del.status === "success",
        `id ${r.id}, delete ${del.status}`,
      );
    } catch (e) {
      const why =
        e instanceof AyrsharePublishError
          ? `${e.message} (code ${e.code})`
          : String(e);
      add(`publish → ${platform}`, false, why);
    }
  }

  report();
}

function report() {
  const pad = Math.max(...checks.map((c) => c.name.length));
  console.log("\n  tenfold — P0 publish path smoke test\n");
  for (const c of checks) {
    console.log(`  ${c.ok ? "✅" : "❌"} ${c.name.padEnd(pad)}  ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n  ${checks.length - failed.length}/${checks.length} passed` +
      (PUBLISH ? "" : "  ·  read-only (use --publish for the full chain)") +
      "\n",
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(
    "\n  smoke test crashed:",
    e instanceof Error ? e.message : e,
    "\n",
  );
  process.exit(1);
});
