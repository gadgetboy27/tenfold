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

## Async Job Pattern

1. Check credits → fail fast with 402 if insufficient
2. Insert `creative_jobs` row (status: queued)
3. `fal.queue.submit(model, { input, webhookUrl })` — non-blocking
4. Store `fal_request_id`, update status to processing
5. Return `{ jobId, requestId }` immediately to client

Webhook handler: log first (idempotency) → find job → handle success/failure → mark processed.
Client: Supabase Realtime `postgres_changes` on `creative_jobs` table.
