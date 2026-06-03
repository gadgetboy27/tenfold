# Production Test Plan — Tenfold.nz

## Test Scenarios

### 1. Authentication & Workspace Setup
- [ ] Sign up with email
- [ ] Login with existing email
- [ ] Verify workspace is auto-created on first login
- [ ] Verify 50 welcome credits are granted
- [ ] Verify slug is unique (attempt duplicate login)
- [ ] Verify rate limiting (10 requests/min per IP)

### 2. Campaign Creation (Step 1)
- [ ] Enter prompt (min 3 chars)
- [ ] Submit campaign
- [ ] Verify credits are debited (18 → 12 after fix)
- [ ] Verify 4 images are generated
- [ ] Verify 6 images in old tests (should now be 4)
- [ ] Verify campaign status transitions: queued → processing → ready

### 3. Image Selection (Step 2)
- [ ] Click to select anchor image
- [ ] Verify anchor is saved
- [ ] Verify status shows "ready"

### 4. Expansion (Step 3)
- [ ] Generate image variation (cost: 3 credits)
- [ ] Generate upscale (cost: 2 credits)
- [ ] Generate video (cost: 15/40/80 depending on length)
- [ ] Generate music (cost: 8 credits)
- [ ] Generate script (cost: 1 credit)
- [ ] Test variation direction input (e.g., "more cinematic")
- [ ] Test parallel generation (multiple jobs at once)

### 5. Composition (Step 4)
- [ ] Select format (square, portrait, landscape, story, reel)
- [ ] Add text overlays (up to 5)
- [ ] Apply brand kit (logo, colors, font)
- [ ] Verify composition saves

### 6. Review & Publishing (Step 5-6)
- [ ] View all variants
- [ ] Edit captions
- [ ] Select hashtags
- [ ] Preview on different platforms
- [ ] Publish to Meta (Facebook + Instagram)
- [ ] Verify Ayrshare integration
- [ ] Verify publish_records created

### 7. Content Agent Pipeline (New Feature)
- [ ] Submit transcript (min 50 chars)
- [ ] Verify submission queued
- [ ] Verify pipeline stages progress: analyse → repurpose → schedule → thumbnails → publish
- [ ] Verify Realtime updates UI
- [ ] Verify SSE fallback on /status endpoint
- [ ] View all generated content (6 formats)
- [ ] Approve and schedule posts
- [ ] Verify posts scheduled via Ayrshare

### 8. Credit System & Billing
- [ ] Verify balance decrements on generation
- [ ] Purchase credit pack (25/100/300)
- [ ] Verify credits are added atomically
- [ ] Subscribe to Creator plan ($29/mo, 350 credits)
- [ ] Verify subscription credits granted on invoice.payment_succeeded
- [ ] Test insufficient credits (402 error)
- [ ] Test credit refund on failed job

### 9. Error Scenarios
- [ ] Invalid prompt (too short)
- [ ] Insufficient credits (show 402 with message)
- [ ] Webhook retry (verify idempotency — no duplicate credits)
- [ ] fal.ai timeout (verify graceful error handling)
- [ ] Missing Ayrshare connection (show error in publish)
- [ ] CORS error from different origin (verify blocked)

### 10. Rate Limiting & Security
- [ ] Auth callback: 11 rapid requests from same IP (should get 429)
- [ ] Verify CRON_SECRET blocks unauthorized pipeline triggers
- [ ] Verify Bearer token required on API routes
- [ ] Verify webhook signature verification (fal.ai, Stripe)
- [ ] Verify workspace_id filters queries (workspace isolation)

### 11. Concurrent Operations
- [ ] Submit 3 campaigns simultaneously
- [ ] Generate 5 jobs in parallel
- [ ] Trigger two refunds for same job (verify one succeeds)
- [ ] Login twice concurrently (verify workspace created once)

### 12. Performance & Scaling
- [ ] Campaign generation completes in <30 seconds
- [ ] Content pipeline completes in <90 seconds
- [ ] Database queries have proper indexes (check query plans)
- [ ] No N+1 queries in campaign list view
- [ ] Image upload to Supabase completes <5s

### 13. Data Integrity
- [ ] Credits always match sum of transactions (audit query)
- [ ] No orphaned records (job without campaign, etc)
- [ ] Workspace isolation enforced (user can't see other workspaces)
- [ ] Publishing doesn't create duplicate publish_records on retry

---

## Manual Testing Checklist

### Prerequisites
- [ ] Supabase project configured
- [ ] fal.ai API key set (for image gen)
- [ ] Ayrshare API key set (for publishing)
- [ ] Stripe keys set (for billing)
- [ ] Anthropic API key set (for content agent)

### Test Execution
1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Sign up with test email
4. Run through scenarios in order
5. Monitor browser console for errors
6. Monitor server logs for warnings

### Monitoring
- [ ] Browser DevTools → Network tab (check status codes)
- [ ] Browser DevTools → Console (no errors/warnings)
- [ ] Server logs (check for unhandled errors)
- [ ] Supabase dashboard (verify data wrote correctly)

---

## Known Limitations Before Launch

✅ FIXED:
- Content pipeline now works on Railway (fire-and-fetch fallback)
- Credit debit is atomic (no race conditions)
- Auth callback is idempotent (no duplicate workspaces)
- Refund is atomic (no duplicate refunds)
- CORS headers are valid

⚠️ TODO (Post-Launch):
- Redis-backed rate limiting (currently in-memory)
- Email verification (currently auto-verified)
- Audit logging (currently basic console logs)
- Observability/Sentry integration (currently none)
- Performance monitoring (currently none)

---

## Success Criteria

✅ All authentication flows work without errors
✅ Campaign creation generates 4 images in <30s
✅ Content pipeline produces 6 format outputs in <90s
✅ Publishing successfully posts to Ayrshare
✅ No duplicate charges or credits
✅ Rate limiting blocks abusive requests
✅ Workspace isolation prevents data leaks
