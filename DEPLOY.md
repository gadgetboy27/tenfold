# DEPLOY.md — tenfold.nz release + branch runbook

> How code reaches production, what gates each release, and how in-progress
> branches stay OUT of production until they're ready. Read this before merging
> anything to `master`.

Production deploys from **`master`** — Railway auto-builds the Dockerfile when
its configured deploy branch receives a push (confirm that branch in the
Railway service settings; this runbook assumes `master`). So the single rule
that keeps production safe is:

> **Nothing merges to `master` until `npm run build`, `npx vitest run`, and
> `npm run smoke` all pass on the branch.** Merging IS deploying.

---

## 1. Current state (2026-07-18)

| Branch | What it is | Status |
|---|---|---|
| `master` | Production. Includes the nav + compositor work (cherry-picked). | live |
| `fix/ayrshare-publish-contract` | The P0–P6 hardening arc + review fixes. Stacks on `feat/social-provider-registry`. | **ready to deploy — see §3** |
| `feat/social-provider-registry` | OAuth provider registry + token refresh + Reddit connect. | comes WITH the branch above (it's the base) |
| `feat/watermark-and-compose-consolidation` | Free-tier watermark, held by decision. | **held — do NOT merge whole (see §5)** |

**The database schema is already ahead of `master`.** Migrations `0016`–`0021`
were applied to production during development. `master`'s code doesn't
reference the new columns/tables, and the permission REVOKEs only affect
direct client access `master` never used — so prod runs safely today as
"master code on branch schema". Deploying `fix/ayrshare-publish-contract` is
what activates the code that uses them.

---

## 2. Environment variables

Set in **Railway** (production) and mirror the two new ones into your local
`.env` for the backfill script (§3, step 4).

### New this release — set BEFORE deploying `fix/ayrshare-publish-contract`

| Var | Required? | Why it gates deploy |
|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | **REQUIRED** | Social-token encryption fails **closed**: connecting an account throws without it. Generate: `openssl rand -base64 32`. **Back it up** — losing it forces every connected account to reconnect. |
| `OAUTH_STATE_SECRET` | recommended | Signs the OAuth CSRF state. Falls back to `META_APP_SECRET` if unset, so it won't break, but set a dedicated one: `openssl rand -base64 32`. |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | optional | Only activates the (dormant) direct Reddit connect. Leave unset — Reddit publishes via Ayrshare today. |

### Already set (do not remove)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `FAL_API_KEY`, `ANTHROPIC_API_KEY`,
`AYRSHARE_API_KEY`, `AYRSHARE_DOMAIN`, `AYRSHARE_PRIVATE_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_PRICE_*` (6 prices), `META_APP_ID`, `META_APP_SECRET`, `RESEND_API_KEY`,
`CRON_SECRET`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAILS`,
`NEXT_PUBLIC_SENTRY_DSN`.

> Config presence IS the feature switch in several places — Sentry no-ops
> without its DSN, Reddit stays dormant without its client id. This is the
> pattern to reuse for dark-launching new work (§6).

---

## 3. Deploying `fix/ayrshare-publish-contract`

Do these in order. Steps 1, 4 and 6 are the ones that gate correctness.

1. **Set `TOKEN_ENCRYPTION_KEY` in Railway** (and your local `.env`, same
   value). Without it the new deploy 500s on any social connect.

2. **Migrations: already applied — do NOT re-run by hand.** `0016`–`0021` are
   live on production. They're idempotent (`IF NOT EXISTS` / `CREATE OR
   REPLACE`) if a migration tool re-applies them, but there's nothing to do.

3. **Merge to `master`** (this deploys). The merge brings
   `feat/social-provider-registry` with it — that's intended, it's the base.
   ```
   git checkout master && git merge --no-ff fix/ayrshare-publish-contract
   git push origin master
   ```

4. **Backfill the one existing plaintext token.** After the key is set:
   ```
   npm run encrypt-tokens          # dry run — should report 1 row
   npm run encrypt-tokens --write  # encrypt it
   ```
   Meta Page tokens never expire, so nothing would ever rewrite this one on its
   own — it stays plaintext forever unless backfilled.

5. **Point an hourly scheduler at maintenance** (sweeps stale rate-limit rows):
   ```
   GET https://tenfold.nz/api/cron/maintenance
   Authorization: Bearer <CRON_SECRET>
   ```

6. **Verify against the live deploy:**
   ```
   npm run smoke          # read-only chain check
   npm run smoke:publish  # schedules a real post 2 days out, then deletes it
   ```
   Expect ✅ on email-verification, welcome-credits, media-reachable, and the
   Ayrshare publish. Instagram shows ❌ until you reconnect Facebook (the new
   scopes need re-consent) on a Page that has an Instagram Business account.

### Rollback

Revert the merge commit and push — Railway redeploys the previous `master`.
Safe because the schema is additive: the old code simply ignores the new
columns/tables. **Do not drop `TOKEN_ENCRYPTION_KEY`** after any token has been
encrypted, or those connections become unreadable.

---

## 4. Post-deploy: the real new-user test

Only meaningful AFTER the branch is live (before it, you're testing `master`,
which still has the bugs this branch fixes). Use a fresh account and walk:
signup → generate → connect Facebook/Instagram → publish → confirm the post is
live. This is the P0 "a stranger can do it unassisted" check that can't be
scripted.

---

## 5. The held watermark branch — cherry-pick, never merge

`feat/watermark-and-compose-consolidation` shares the nav + compositor commits
that are **already on `master`** (they landed via cherry-pick with edits, so
git sees them as different commits). Merging the branch whole would conflict
and try to re-apply them.

When you decide to ship the watermark, take **only** its watermark commit:
```
git checkout master
git cherry-pick c04187d          # feat(billing): watermark free-tier posts
# resolve the aspect-classes.ts / entitlements overlaps, test, then push
```
Before shipping it, also decide the pricing copy: `UpgradeModal` and the Agency
tier still reference watermark/white-label features gated behind it.

---

## 6. Starting the logo-builder section (or any new feature) safely

Goal: build it isolated, and get it into production **dark** — present but
invisible — so it can't spoil what's live even after it merges.

**Recommended: short-lived branch + env-gated dark launch.**

1. Branch off the CURRENT `master` (after §3 lands), never off an old base:
   ```
   git checkout master && git pull
   git checkout -b feat/logo-builder
   ```

2. Gate every entry point on a flag whose ABSENCE means off, matching the
   codebase's existing pattern (Sentry/Reddit):
   ```ts
   // lib/flags.ts
   export const LOGO_BUILDER_ENABLED =
     process.env.NEXT_PUBLIC_FEATURE_LOGO_BUILDER === "1";
   ```
   - Hide the nav item / route behind `LOGO_BUILDER_ENABLED`.
   - Return 404 from any new API route when the flag is off.
   - The flag is UNSET in Railway, so it's invisible in production even once
     merged.

3. This lets you **merge to `master` early and often** while staying dark —
   which avoids the exact rot the watermark branch now suffers: a long-lived
   branch drifts from `master` until it conflicts. Short branches that merge
   behind a flag never drift.

4. Flip `NEXT_PUBLIC_FEATURE_LOGO_BUILDER=1` in Railway only when it's tested
   and you're ready. Turning it off again is instant — no revert, no redeploy
   of code.

**If you'd rather keep it fully on a branch** (your stated preference): fine,
but rebase it onto `master` weekly so it doesn't drift, keep migrations additive
and gated the same way, and run `npm run build` + `vitest` before every merge.
The flag approach is safer because "not deployed" and "deployed but off" behave
identically to users, and only the flag version lets you test the real
integration on production infrastructure before launch.

### Overlay vs separate

Either works with the flag. If the logo builder **overlays** existing assets
(stamps a generated logo onto composed output), build it as a compositor layer
type — reuse `lib/composition/*`, don't fork it. If it's a **separate** tool
(design a logo from scratch), give it its own route under
`app/(dashboard)/[workspace]/logo/` and its own `lib/logo/` module, sharing
only the credit/debit and storage plumbing. Decide which before starting — the
overlay path is far less code but couples you to the composition pipeline.

---

## 7. Release checklist (copy per deploy)

```
[ ] Branch: build clean (npm run build)
[ ] Branch: tests green (npx vitest run)
[ ] Branch: smoke green (npm run smoke)
[ ] New env vars set in Railway
[ ] Migrations applied (or confirmed already applied)
[ ] Merge to master + push
[ ] Backfill / one-off scripts run (if any)
[ ] Cron/schedulers wired
[ ] Post-deploy smoke against live (npm run smoke)
[ ] Real user-journey spot check
```
