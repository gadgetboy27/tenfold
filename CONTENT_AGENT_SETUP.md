# Content Agent Pipeline — Implementation Summary

## ✅ What Was Built

A complete 6-stage AI-powered content automation system that takes a video transcript or written content and produces a full week of cross-platform social media posts, ready to publish via Ayrshare.

---

## 📁 Files Created

### Core Library (`/lib/content-agent/`)
- **`types.ts`** — All TypeScript interfaces and types
- **`stage1-analyse.ts`** — Analyzes transcript, extracts 5 insights + 10 hooks
- **`stage2-repurpose.ts`** — Generates 6 format-specific outputs (YouTube, LinkedIn, Twitter, Instagram, TikTok, Email)
- **`stage3-schedule.ts`** — Computes NZST-based publication schedule (7 posts/week)
- **`stage4-thumbnails.ts`** — Queues 3 thumbnail image jobs via fal.ai
- **`stage5-publish.ts`** — Publishes to Ayrshare with scheduling
- **`stage6-analytics.ts`** — Weekly cron: analyzes performance, sends email report
- **`index.ts`** — Pipeline orchestrator: runs stages sequentially/in parallel, handles faults

### Validation
- **`/lib/validation/content-schemas.ts`** — Zod schemas for content submission and approval

### API Routes
- **`/app/api/content/submit/route.ts`** — POST: accepts transcript, starts pipeline (async via `after()`)
- **`/app/api/content/[id]/status/route.ts`** — GET SSE: streams live pipeline progress
- **`/app/api/content/[id]/results/route.ts`** — GET: returns all pipeline outputs
- **`/app/api/content/[id]/approve/route.ts`** — POST: triggers Ayrshare publishing
- **`/app/api/cron/analytics/route.ts`** — GET: weekly analytics cron (requires `CRON_SECRET` header)

### UI Components (`/components/content/`)
- **`ContentSubmit.tsx`** — Textarea + file upload, submits transcript
- **`PipelineStatus.tsx`** — Live 6-stage progress indicator with Realtime updates
- **`ContentReview.tsx`** — Side-by-side editable review of all 6 content formats
- **`ApproveAll.tsx`** — One-click publish button with confirmation

### Database
- **`/db/schema.ts`** — Added 3 new tables:
  - `contentSubmissions` — submission metadata (workspace, transcript, status)
  - `contentPipelineResults` — per-stage outputs and status
  - `analyticsReports` — weekly performance reports
- **`/db/migrations/0002_content_agent.sql`** — Migration file with RLS policies

### Testing
- **`/tests/unit/content-agent.test.ts`** — 4 tests covering:
  - Stage 1 output validation (5 insights, 10 hooks)
  - Stage 3 scheduling (7 posts, correct NZST times)
  - Stage 6 analytics report structure

### Configuration
- **`/lib/validation/env.ts`** — Added optional `CRON_SECRET` env var

---

## 🔄 Pipeline Flow

```
1. ANALYSE (sequential)
   ↓
   ├→ 2. REPURPOSE (parallel) 
   │  └→ 6 format outputs
   │
   ├→ 4. THUMBNAILS (parallel)
   │  └→ 3 fal.ai image jobs
   │
   3. SCHEDULE (after REPURPOSE)
      └→ 7 scheduled posts
   
   5. PUBLISH (manual trigger via /approve)
      └→ Posts to Ayrshare
   
   6. ANALYTICS (weekly cron)
      └→ Performance report email
```

---

## 🚀 Getting Started

### 1. Add Environment Variables
Add to `.env.local`:
```bash
CRON_SECRET=your-secret-token-here
```

### 2. Run Database Migration
```bash
npx drizzle-kit migrate
```

This creates the 3 new tables with RLS policies enabled.

### 3. Test the System

**Manual test:**
```bash
curl -X POST http://localhost:3000/api/content/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"transcript": "Your content transcript here (min 50 chars)"}'
```

**Response:**
```json
{"submissionId": "uuid"}
```

Then visit `/content/[submissionId]` to watch the pipeline progress.

### 4. Run Tests
```bash
npx vitest run tests/unit/content-agent.test.ts
```

All 4 tests should pass.

### 5. Type Check
```bash
npx tsc --noEmit
```

Should have zero errors.

---

## 🔗 Integration Points

### Existing Systems Reused
- **Anthropic SDK** — Uses same pattern as `lib/claude/` (module-level instantiation, `claude-sonnet-4-6`)
- **fal.ai queue** — Reuses `enqueueJob()` from `lib/fal/queue.ts`
- **Ayrshare API** — Uses `ayrsharePost()` from `lib/ayrshare/client.ts`
- **Auth** — Uses `getSession()` from `lib/auth/session.ts`
- **Supabase** — Uses `createSupabaseAdminClient()` + Realtime subscriptions
- **Email** — Uses Resend SDK (already in deps)

### Database Schema Integration
- All tables have `workspace_id` (workspace-scoped)
- RLS policies enforce workspace isolation
- Cascading deletes on workspace removal
- Follows existing naming conventions (snake_case, FK refs)

---

## 📊 Cost Structure

No credit debit — the content agent is a **free feature**. However, it:
- Calls Claude Sonnet 4.6 (Anthropic API cost) — **not from user credits**
- Queues fal.ai image jobs (Flux generation) — **users pay credits separately when they approve thumbnail publication**
- Publishes via Ayrshare — **free routing, no additional cost**
- Sends analytics email — **via Resend, minimal cost**

### Scaling Notes
- Stage 1 (Analyse): ~1-2 seconds (single Claude call)
- Stage 2 (Repurpose): ~8-12 seconds (6 parallel Claude calls)
- Stage 4 (Thumbnails): ~20-30 seconds (3 parallel fal.ai queue submissions, results arrive async via webhook)
- **Total pipeline time**: ~30-45 seconds from start to completion (Stages 1-3 only, not counting thumbnail completions)

---

## 🔐 Security

✅ **API keys never exposed to client**
- `ANTHROPIC_API_KEY` — server-side only
- `AYRSHARE_API_KEY` — server-side only
- `RESEND_API_KEY` — server-side only

✅ **All endpoints auth-gated**
- `getSession()` verifies user is workspace member
- `workspace_id` query filters (workspace isolation)

✅ **Webhook idempotency**
- fal.ai webhook reuses existing handler in `/api/webhooks/fal`
- Incoming webhook data logged to `webhook_logs` table before processing

✅ **RLS enabled on all new tables**
- Row-level security policies prevent cross-workspace data access

---

## 📝 Monitoring & Debugging

### Check Pipeline Status
```sql
SELECT * FROM content_submissions WHERE workspace_id = 'ws-id' ORDER BY created_at DESC LIMIT 5;
SELECT * FROM content_pipeline_results WHERE submission_id = 'sub-id' ORDER BY created_at;
```

### Check Thumbnail Jobs
Thumbnail image jobs are stored in the existing `creative_jobs` table (created by Stage 4 via `enqueueJob()`). Monitor via:
```sql
SELECT * FROM creative_jobs WHERE type = 'image_generation' 
  AND created_at > NOW() - INTERVAL '1 day';
```

### Analytics Cron
Test the weekly cron (requires valid `CRON_SECRET`):
```bash
curl -H "Authorization: Bearer your-cron-secret" \
  http://localhost:3000/api/cron/analytics
```

---

## 🔄 Running Weekly Analytics

Option 1: **Railway Cron Schedule** (production)
Set a Cron Schedule on the service in the Railway dashboard (Settings → Cron
Schedule, e.g. `0 8 * * 1`), with the start command hitting the endpoint:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://tenfold.nz/api/cron/analytics
```
(Or trigger it from any external scheduler — a GitHub Actions scheduled
workflow works too — since it's just a Bearer-token-protected GET.)

Option 2: **Local Testing**
```bash
curl -X GET http://localhost:3000/api/cron/analytics \
  -H "Authorization: Bearer dev-secret"
```

---

## 🗓️ Monthly Model Review

`/api/cron/model-review` emails the operator the current model registries
(image variety, music, captions) plus how often users pick each variety-pack
model, so we can refresh the lists as fal.ai / Anthropic ship better models.
Verify any new endpoint live before wiring it. Requires `CRON_SECRET`; sends to
`MODEL_REVIEW_EMAIL` if set (otherwise returns the JSON report only).

Schedule monthly (1st of the month, 09:00):
```json
{ "crons": [ { "path": "/api/cron/model-review", "schedule": "0 9 1 * *" } ] }
```

Test locally:
```bash
curl -X GET http://localhost:3000/api/cron/model-review \
  -H "Authorization: Bearer dev-secret"
```

---

## 🐛 Troubleshooting

### Pipeline stuck on "analyse"
- Check `ANTHROPIC_API_KEY` is set and valid
- Check transcript length (min 50 chars)
- View error in `content_pipeline_results.error` column

### Thumbnails not completing
- Check `creative_jobs` table for errors
- Verify `FAL_API_KEY` is valid
- Check webhook logs: `SELECT * FROM webhook_logs WHERE source = 'fal'`

### Publish fails with "Workspace has not connected Ayrshare"
- Workspace must have set `ayrshare_profile_key` in `workspaces` table
- User must connect Ayrshare first via the social auth flow

### Tests fail
```bash
# Clear cache and retry
rm -rf node_modules/.vite
npx vitest run tests/unit/content-agent.test.ts
```

---

## 📚 Next Steps (Optional Enhancements)

1. **Video asset generation** — Add video generation to Stage 4 (extend beyond thumbnails)
2. **Multi-language support** — Add language parameter to all Claude prompts
3. **Custom scheduling** — Let users define custom day/time for each platform
4. **Content editing UI** — Full rich-text editor for ContentReview instead of textarea
5. **Performance analytics dashboard** — Visualize analytics reports over time
6. **Bulk submission** — Accept multiple transcripts, run pipelines in parallel
7. **Template system** — Save and reuse custom prompts per workspace
8. **A/B testing** — Auto-generate variants with different hooks/angles

---

## ✅ Verification Checklist

- [x] TypeScript compiles: `npx tsc --noEmit`
- [x] Tests pass: `npx vitest run tests/unit/content-agent.test.ts`
- [x] All 3 database tables added to schema
- [x] RLS policies created on all tables
- [x] All 11 new files created
- [x] Environment variable added to validation
- [x] API routes follow auth pattern
- [x] UI components use client-side Supabase + Realtime
- [x] Pipeline handles faults gracefully
- [x] 6 stages implemented and ordered correctly
- [x] Ayrshare integration ready
- [x] Email sending via Resend
- [x] Analytics report generation ready
