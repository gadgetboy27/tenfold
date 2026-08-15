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

### The webhook is a single point of failure for refunds — hence the sweeper

Every terminal outcome for a fal job runs through the webhook, **including
`refundCredits`**. So a webhook that never arrives (fal drops it, `APP_URL` is
wrong, the service redeploys mid-fire) leaves the job in `processing` forever
and the user's credits gone with no recovery path anywhere else in the app.

`lib/jobs/sweep.ts` + `GET /api/cron/sweep-jobs` is that path. Auth mirrors the
other crons (Bearer `CRON_SECRET`). **Not scheduled automatically** — Railway
crons are configured per-service in the dashboard (Settings → Cron Schedule),
so this needs registering by hand; hourly (`0 * * * *`) is the intent.

Three rules it must keep:

- **Zero assets → `failed` + refund. Any assets → `completed`, no refund.**
  The second half mirrors `finalizeMultiImage`'s existing partial-success rule
  (any image ≥ 1 completes the job and charges for it). Diverge and the same
  half-delivered outcome costs a user nothing or everything depending purely on
  whether a webhook happened to land.
- **Status is `failed`, never a new enum value.** A dozen client polls across
  Studio, the Pro panels and the Compositor branch on `status === "failed"`; a
  novel status would be silently unrecognised by every one of them — exactly
  the never-resolving spinner this work exists to remove. The
  swept-vs-genuinely-failed distinction lives in `fal_raw_error.swept_by`.
- **A swept job is ignored by the webhook** (alongside the existing `cancelled`
  check), or a late webhook re-completes a job whose credits were already
  returned and the user gets both. Gated on the `swept_by` marker specifically,
  **not** on `status === "failed"` — a multi-direction job is marked failed by
  its first failing direction while siblings are still legitimately in flight.

Both writes are guarded on the status still being in-flight (`.in("status",
["queued","processing"])` on the UPDATE, refund only if a row came back), so a
webhook that wins the race keeps its outcome. `refund_credits` (migration 0005)
is itself atomic and idempotent, so this is belt-and-braces rather than the only
defence. Threshold is 45 minutes — an order of magnitude past the slowest real
job (`video_30s`, two Kling segments). Run `?dryRun=1` first; `?minutes=N`
overrides the threshold, floored at 15.

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
