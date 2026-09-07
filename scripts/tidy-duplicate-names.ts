/**
 * One-off tidy: give duplicate campaign names distinct ones.
 *
 * Two bugs put them there (see the "weaker generator won by import path"
 * commit): a 16×16 word list Studio happened to import, and a name that only
 * re-rolled on "New campaign" so a second Generate reused it. Both are fixed;
 * this cleans up what they already produced.
 *
 *   npx dotenv -e .env -- npx tsx scripts/tidy-duplicate-names.ts <workspace-slug>
 *   npx dotenv -e .env -- npx tsx scripts/tidy-duplicate-names.ts <workspace-slug> --apply
 *
 * Without --apply it prints the plan and changes nothing.
 *
 * ── Rules, and why ─────────────────────────────────────────────────────────
 *
 * **The oldest of each group keeps its name.** First claim wins; it is also
 * the one most likely to be linked to or remembered.
 *
 * **A generated-looking name is replaced, a written one is suffixed.**
 * "Amber Pulse" carries no information — it was a placeholder nobody chose, so
 * a fresh placeholder loses nothing. "roam. — adventure matching | Find people
 * who move like you" came from a real brand import, and replacing it with
 * "Cobalt Drift" would destroy something the user meant. Those get " (2)".
 *
 * **New names avoid every name in the workspace, not just the duplicates.**
 * Renaming one collision into a different collision is not a fix.
 *
 * Scoped to ONE workspace, named on the command line. There is no "all
 * workspaces" mode on purpose: this rewrites other people's project titles,
 * and that should never be a flag away.
 */
import { createClient } from "@supabase/supabase-js";
import { generateCampaignName } from "../lib/names/generator";

const apply = process.argv.includes("--apply");
const slug = process.argv[2];

/** Matches the shape the generator produces: two capitalised words. */
const GENERATED_SHAPE = /^[A-Z][a-z]+ [A-Z][a-z]+$/;
/** The column default — never a name anyone typed. */
const DB_DEFAULT = "Untitled Campaign";

function isPlaceholder(name: string): boolean {
  const n = name.trim();
  return n === DB_DEFAULT || GENERATED_SHAPE.test(n);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

interface Row {
  id: string;
  name: string;
  created_at: string;
}

async function main() {
  if (!slug || slug.startsWith("--")) {
    throw new Error(
      "Pass the workspace slug: tsx scripts/tidy-duplicate-names.ts <slug> [--apply]",
    );
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY missing");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: ws, error: wsErr } = await db
    .from("workspaces")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (wsErr) throw new Error(wsErr.message);
  if (!ws) throw new Error(`No workspace with slug "${slug}"`);

  const { data, error } = await db
    .from("campaigns")
    .select("id, name, created_at")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];

  // Every name in the workspace is off-limits for a replacement, including the
  // ones we're keeping.
  const taken = new Set(rows.map((r) => norm(r.name)));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = norm(r.name);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const plan: { row: Row; to: string; why: string }[] = [];
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    // Already ordered oldest-first by the query.
    const [keeper, ...rest] = members;
    void keeper;
    for (const row of rest) {
      let to: string;
      let why: string;
      if (isPlaceholder(row.name)) {
        to = generateCampaignName(taken);
        why = "placeholder — replaced";
      } else {
        // Suffix, preserving whatever the user actually meant.
        let n = 2;
        while (taken.has(norm(`${row.name} (${n})`))) n++;
        to = `${row.name} (${n})`;
        why = "written name — numbered";
      }
      taken.add(norm(to));
      plan.push({ row, to, why });
    }
  }

  if (plan.length === 0) {
    console.log(`No duplicate names in "${slug}". Nothing to do.`);
    return;
  }

  console.log(
    `${apply ? "APPLYING" : "DRY RUN"} — workspace "${slug}", ` +
      `${plan.length} of ${rows.length} campaigns would be renamed\n`,
  );
  for (const { row, to, why } of plan) {
    console.log(
      `  ${row.created_at.slice(0, 16).replace("T", " ")}  ${row.id.slice(0, 8)}\n` +
        `    from: ${row.name}\n` +
        `      to: ${to}   (${why})\n`,
    );
  }

  if (!apply) {
    console.log("Nothing written. Re-run with --apply to make these changes.");
    return;
  }

  let done = 0;
  for (const { row, to } of plan) {
    // One at a time, scoped by workspace as well as id: a batch that half
    // fails leaves no way to tell which half, and this is not slow enough to
    // be worth the ambiguity.
    const { error: upErr } = await db
      .from("campaigns")
      .update({ name: to })
      .eq("id", row.id)
      .eq("workspace_id", ws.id);
    if (upErr) {
      console.error(`  FAILED ${row.id}: ${upErr.message}`);
      continue;
    }
    done++;
  }
  console.log(`\nRenamed ${done} of ${plan.length}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
