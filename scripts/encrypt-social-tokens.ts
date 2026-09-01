/**
 * One-off backfill: encrypt the OAuth credentials already sitting in
 * social_profiles as plaintext (ISSUES.md #38).
 *
 * ORDER MATTERS. Deploy the reading/writing code FIRST, then run this. The
 * decrypt path passes plaintext straight through, so a table that is half
 * migrated works throughout — there is never a window where publishing breaks.
 * Running this before the deploy would do the opposite: encrypted rows against
 * code that cannot decrypt them.
 *
 * Idempotent. Rows already carrying the v1: prefix are skipped, so re-running
 * after a partial failure is safe and cheap.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SOCIAL_TOKEN_KEY=... \
 *     npx tsx scripts/encrypt-social-tokens.ts [--apply]
 *
 * Without --apply it reports what it WOULD do and changes nothing.
 */
import { createClient } from "@supabase/supabase-js";
import {
  encryptProfileTokens,
  isEncrypted,
  isTokenEncryptionEnabled,
} from "../lib/social/token-crypto";

const apply = process.argv.includes("--apply");

async function main() {
  if (!isTokenEncryptionEnabled()) {
    throw new Error(
      "SOCIAL_TOKEN_KEY is not set — refusing to run. Without it this would " +
        "rewrite every row as plaintext and report success.",
    );
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY missing");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db
    .from("social_profiles")
    .select(
      "id, workspace_id, platform, access_token, refresh_token, metadata",
    );
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    workspace_id: string;
    platform: string;
    access_token: string | null;
    refresh_token: string | null;
    metadata: { facebook_pages?: { access_token?: string | null }[] } | null;
  }[];

  let changed = 0;
  for (const row of rows) {
    const nestedPlain = (row.metadata?.facebook_pages ?? []).some(
      (p) => p.access_token && !isEncrypted(p.access_token),
    );
    const needs =
      (row.access_token && !isEncrypted(row.access_token)) ||
      (row.refresh_token && !isEncrypted(row.refresh_token)) ||
      nestedPlain;
    if (!needs) {
      console.log(`skip  ${row.platform} ${row.id} (already encrypted)`);
      continue;
    }
    changed += 1;
    console.log(
      `${apply ? "ENCRYPT" : "would"} ${row.platform} ${row.id} ` +
        `access=${!!row.access_token} refresh=${!!row.refresh_token} ` +
        `pages=${row.metadata?.facebook_pages?.length ?? 0}`,
    );
    if (!apply) continue;

    const enc = encryptProfileTokens({
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      metadata: row.metadata,
    });
    const { error: upErr } = await db
      .from("social_profiles")
      .update({
        access_token: enc.access_token,
        refresh_token: enc.refresh_token,
        metadata: enc.metadata,
      })
      .eq("id", row.id);
    // Stop on the first failure rather than limping on: a partial pass is
    // fine (the code reads both shapes), a silent one is not.
    if (upErr) throw new Error(`row ${row.id}: ${upErr.message}`);
  }

  console.log(
    `\n${rows.length} rows, ${changed} ${apply ? "encrypted" : "would be encrypted"}.`,
  );
  if (!apply && changed > 0) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
