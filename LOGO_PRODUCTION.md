# LOGO_PRODUCTION.md — the logo builder

> Build plan for the logo section. Lives on `feat/logo-builder`, dark-launched
> behind the `FEATURE_LOGO_BUILDER` flag so it can merge to `master` and ship to
> production **invisible** until it's ready. See `DEPLOY.md` §6 for why this
> beats a long-lived branch.

---

## 1. How it's gated (already scaffolded)

| Piece | File | Behaviour when flag OFF |
|---|---|---|
| Flag helper | `lib/flags.ts` | `isEnabled("logoBuilder")` → false unless `FEATURE_LOGO_BUILDER=1` |
| Route (server-gated) | `app/(dashboard)/[workspace]/logo/page.tsx` | real 404 (`notFound()`) |
| Client UI | `components/logo/LogoBuilder.tsx` | never rendered |
| API | `app/api/logo/route.ts` | 404 |

**Flip it on:** set `FEATURE_LOGO_BUILDER=1` in Railway. Server-side and
runtime-read, so it takes effect on the next request after restart — no
rebuild. Turning it off again is just as instant. It fails **closed**: only the
exact string `"1"` is on, so a typo can't launch it by accident (tested in
`tests/unit/flags.test.ts`).

**Rule for new logo code:** every new route/page gates on the flag FIRST. Copy
the guard from the two scaffold files. A gated feature must be genuinely absent
in production, not a reachable stub.

**Nav:** the sidebar link to the builder must also be flag-gated. The nav is a
client component, so read `isEnabled("logoBuilder")` in a server parent
(layout) and pass the boolean down as a prop — never import `lib/flags` into
`"use client"` code.

---

## 2. The decision to make FIRST: overlay vs. separate

This shapes everything after it. Decide before writing feature code.

### Option A — Overlay (a compositor layer)
The logo is generated, then **stamped onto** existing composed output (images /
video) as another layer.

- Build it as a new layer kind in `lib/composition/*`. Reuse the canvas +
  FFmpeg pipeline already there — do **not** fork it.
- Far less code; you inherit positioning, blend modes, export, multi-format.
- Couples you to the composition pipeline: a logo layer must round-trip through
  the same Zod schema, canvas preview, and FFmpeg export, kept in lockstep.
- Best if "logo" means *branding applied to campaign assets*.

### Option B — Separate (a standalone tool)
A from-scratch logo *designer* — its own canvas, its own output, unrelated to
campaign assets.

- Own route `app/(dashboard)/[workspace]/logo/`, own `lib/logo/` module.
- Shares only the plumbing: credits/debit (`lib/credits/*`), storage
  (Supabase `assets` bucket), auth (`getSession` / `withWorkspace`).
- More code, but no coupling to the composition pipeline; free to evolve.
- Best if "logo" means *a distinct product surface*.

**Recommendation:** if the goal is "put the user's logo on what they make",
that's Option A and it's a fraction of the work. If it's "design a brand logo
from a prompt", that's Option B. Pick one and note it here before starting.

> DECISION: _(fill in)_ — chosen approach and one line of why.

---

## 3. Non-negotiables (inherited from CLAUDE.md)

Whatever the approach, the platform's rules still apply:

1. **Credits are a ledger.** Any generative logo action debits via
   `debitCredits()` in the SAME transaction as the job, and refunds atomically
   on failure. Add its cost to `lib/credits/costs.ts` (and the real provider
   cost to `lib/costs/rates.ts` — the two move together, or the margin maths
   silently breaks). Price it against real inference cost, not a guessed
   multiple.
2. **fal.ai is async.** If generation uses fal, create the `creative_jobs` row,
   enqueue with a webhook, return the job id — never `await` generation inline.
3. **Workspace-scoped + RLS.** Any new table has `workspace_id`, RLS enabled,
   and every query filters on it. Prefer the `withWorkspace` wrapper for new
   API routes.
4. **Server-side secrets only.** No API key reaches the client.
5. **Composition is server-side.** No base64 image round-trips to the browser;
   output goes to Supabase Storage, URL returned.

---

## 4. Suggested build phases

Each phase ends green (`npm run build`, `npx vitest run`) and can merge to
`master` while the flag stays off.

- **Phase 0 — scaffold** ✅ done: flag, gated route/page/API, test.
- **Phase 1 — the surface.** Real UI in `LogoBuilder.tsx`, flag-gated nav link.
  Still no generation — just the shell, so the shape is reviewable.
- **Phase 2 — generation.** Wire the actual logo generation (fal endpoint or
  overlay render). Credit cost + provider cost added together. Job/webhook if
  async.
- **Phase 3 — persistence + reuse.** Save outputs to Storage as `assets`; make
  them selectable wherever they're used (brand kit, compositor, publish).
- **Phase 4 — launch.** Flip `FEATURE_LOGO_BUILDER=1`. Watch the first real
  runs. Turn off instantly if anything's wrong.

---

## 5. Branch hygiene

- Branch is `feat/logo-builder`, off `master`.
- **Rebase onto `master` whenever `master` moves** (especially after the P0–P6
  branch lands) — don't let it drift.
- Merge to `master` early and often behind the flag; don't hoard commits.
- Migrations, if any, are additive and applied like everything else
  (`DEPLOY.md` §3).
- `FEATURE_LOGO_BUILDER` goes in `.env.example` (documented, unset) so the flag
  is discoverable.
