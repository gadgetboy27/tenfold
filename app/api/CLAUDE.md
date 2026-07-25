# app/api — routing + job conventions

## Routing layer — `withWorkspace` (standard for new API routes)

The service-role admin client (`lib/supabase/admin.ts`) bypasses RLS, so tenant
isolation cannot rely on RLS alone — it depends on every query filtering by
`workspace_id`. To make that automatic, **new App Router API routes use
`withWorkspace` (`lib/api/with-workspace.ts`)** instead of calling `getSession()`

- admin client by hand:

```typescript
export const GET = withWorkspace<{ id: string }>(
  async (req, { db, session, params }) => {
    const { data } = await db
      .from("campaigns")
      .select("*")
      .eq("id", params.id)
      .single();
    return NextResponse.json(data); // workspace_id filter already applied
  },
);
```

- `db` auto-applies `.eq('workspace_id', …)` on reads and injects it on writes for
  every table in `WORKSPACE_SCOPED_TABLES`. Use `ctx.admin` (raw, unscoped) only
  for webhooks / cross-table work.
- The wrapper handles auth (401), rate-limiting (429), and the 500 fallback.
- First-login workspace provisioning lives in one place: `getOrProvisionWorkspace`
  (`lib/auth/provisioning.ts`). Do not re-implement it inline in auth routes.

## Approval state machine — `campaigns.approval_status`

`campaigns.approval_status: 'draft' | 'pending_review' | 'approved'`
(migration `0026_campaign_approval.sql`) gates the one action that matters —
publishing — for `member`-role users. `owner`/`admin` bypass every gate below;
the whole point is restricting member-role publishing, not solo/owner
workflows.

- `POST /api/campaigns/[id]/submit-review` — any member, `draft` →
  `pending_review`.
- `POST /api/campaigns/[id]/approve` — owner/admin only, `draft` OR
  `pending_review` → `approved` (so an owner/admin can self-approve without
  the review round-trip). Records `approved_by` / `approved_at`.
- `POST /api/campaigns/[id]/reject` — owner/admin only, `pending_review` →
  `draft` ("changes requested"), clearing `approved_by`/`approved_at`.
- **Enforcement lives in `POST /api/publish`**, not just the UI: it resolves
  `campaignId` from whichever publish path fired (`body.campaignId` for
  video; `assets.campaign_id` via `body.assetId`; `compositions.campaign_id`
  via `body.compositionId`), then 403s if `session.role === 'member'` and
  that campaign's `approval_status !== 'approved'`. Owner/admin always pass.
- UI: `components/studio/PublishCanvas.tsx` shows a status banner with the
  role-appropriate action (submit / approve / request changes) — see
  `components/studio/CLAUDE.md`.

## Async Job Pattern

1. Check credits → fail fast with 402 if insufficient
2. Insert `creative_jobs` row (status: queued)
3. `fal.queue.submit(model, { input, webhookUrl })` — non-blocking
4. Store `fal_request_id`, update status to processing
5. Return `{ jobId, requestId }` immediately to client

Webhook handler: log first (idempotency) → find job → handle success/failure → mark processed.
Client: Supabase Realtime `postgres_changes` on `creative_jobs` table.

### Claude-only (non-fal) credit-charged actions

A synchronous Claude-only route (e.g. `app/api/hooks/route.ts`,
`app/api/campaigns/analyze-url/route.ts`) skips the webhook/Realtime half of
the pattern above, but still needs a **real `creative_jobs` row**, not just
a `debitCredits()` call — `refund_credits()` (`db/migrations/0005`) looks up
`credits_charged` by job id to know how much to reverse on failure, and
`creative_jobs.campaign_id` is `NOT NULL`. (`credit_transactions.job_id`
itself has no enforced FK — confirmed live, despite a stale comment in
`db/schema.ts` — so nothing stops you from skipping the job row, but doing
so silently breaks refund-on-failure.) If the action runs before any real
campaign exists yet (as `analyze-url` does), create a lightweight campaign
row to hang the job off rather than skipping this — see that route for the
pattern: debit → insert `creative_jobs` (queued) → do the work → mark
completed/failed → `refundCredits(jobId)` on failure.
