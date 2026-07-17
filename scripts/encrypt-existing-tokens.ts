/**
 * One-off backfill: encrypt the social tokens that predate encryption.
 *
 *   npx tsx scripts/encrypt-existing-tokens.ts          # report only
 *   npx tsx scripts/encrypt-existing-tokens.ts --write  # actually encrypt
 *
 * decryptToken() passes plaintext through, so nothing is broken without this —
 * old rows keep working and get encrypted on their next write. But "their next
 * write" for a Meta Page token is a manual reconnect that may never happen:
 * Page tokens don't expire, so the refresh layer never touches them. Left alone,
 * the plaintext simply stays there forever, which is the thing we set out to fix.
 *
 * Idempotent: already-encrypted values are skipped, so a re-run is a no-op.
 */
import { readFileSync } from "node:fs";
import { encryptToken, isEncrypted } from "../lib/security/token-crypto";

function loadEnv(file = ".env") {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const WRITE = process.argv.includes("--write");
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

interface Row {
  id: string;
  platform: string;
  access_token: string | null;
  refresh_token: string | null;
  metadata: {
    facebook_pages?: { id: string; name: string; access_token: string }[];
  } | null;
}

async function main() {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.error(
      "\n  TOKEN_ENCRYPTION_KEY is not set. Generate: openssl rand -base64 32\n",
    );
    process.exit(1);
  }

  const rows = (await fetch(
    `${SUPA}/rest/v1/social_profiles?select=id,platform,access_token,refresh_token,metadata`,
    { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } },
  ).then((r) => r.json())) as Row[];

  console.log(`\n  ${rows.length} social profile(s)\n`);
  let touched = 0;

  for (const row of rows) {
    const patch: Record<string, unknown> = {};

    for (const col of ["access_token", "refresh_token"] as const) {
      const v = row[col];
      if (v && !isEncrypted(v)) patch[col] = encryptToken(v);
    }

    // The page tokens hide inside jsonb, one per managed page — the biggest
    // pile of credentials here, and the easiest to walk past.
    const pages = row.metadata?.facebook_pages;
    if (pages?.some((p) => p.access_token && !isEncrypted(p.access_token))) {
      patch.metadata = {
        ...row.metadata,
        facebook_pages: pages.map((p) => ({
          ...p,
          access_token: isEncrypted(p.access_token)
            ? p.access_token
            : encryptToken(p.access_token),
        })),
      };
    }

    const fields = Object.keys(patch);
    if (fields.length === 0) {
      console.log(`  ✓ ${row.platform.padEnd(10)} already encrypted`);
      continue;
    }
    touched++;
    console.log(
      `  ${WRITE ? "→" : "·"} ${row.platform.padEnd(10)} would encrypt: ${fields.join(", ")}`,
    );

    if (WRITE) {
      const res = await fetch(
        `${SUPA}/rest/v1/social_profiles?id=eq.${row.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: SRK,
            Authorization: `Bearer ${SRK}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        console.error(`    FAILED: ${res.status} ${await res.text()}`);
        process.exit(1);
      }
      console.log(`    encrypted`);
    }
  }

  console.log(
    `\n  ${touched} row(s) ${WRITE ? "encrypted" : "need encrypting"}` +
      (WRITE || touched === 0 ? "" : "  ·  re-run with --write") +
      "\n",
  );
}

main().catch((e) => {
  console.error(
    "\n  backfill failed:",
    e instanceof Error ? e.message : e,
    "\n",
  );
  process.exit(1);
});
