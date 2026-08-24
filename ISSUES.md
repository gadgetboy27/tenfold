# ISSUES.md — found, fixed, and still open

A running log of defects found in prettymuch.nz, with evidence and status.
Newest session first. **Add to this as you find things** — before this file
existed, findings lived only in chat transcripts and were lost.

Status: ✅ fixed & deployed · 🟡 fixed, not deployed · 🔴 open · ⚪ won't fix

---

## 2026-08-24 — logo stall investigation + production walkthrough

### ✅ 1. fal webhooks binned finished work on a null field

`falWebhookPayloadSchema` used `.optional()` for media metadata. Zod's
`.optional()` accepts `undefined` but **rejects an explicit `null`**, and
Recraft sends `"file_size": null` on every webp. The handler correctly returns
200 on a parse failure (a 4xx makes fal retry forever), so the failure was
silent: images finished and reachable, job stuck in `processing`, user watching
a spinner with no error.

- **Blast radius:** 107 completed generations across 21 jobs since June —
  `image_generation`, `logo_concepts`, `bg_remove`, `composite_cutout`,
  `image_variation`. Logo Studio hit it every single run (Recraft always nulls
  `file_size`), so `logo_concepts` had **never once completed**.
- **Fix:** every media field but `url` is `.nullish()`. `lib/fal/webhooks.ts`.
- **Recovery:** one stuck job replayed from `webhook_logs` payloads; six
  concepts restored byte-for-byte.
- Commit `e73e3cd`.

### ✅ 2. `refundCredits()` had never worked, at all

`refund_credits(uuid, uuid, integer, text)` takes four arguments; the code
passed one (`{ p_job_id }`). PostgREST matched no function, the RPC errored,
and the helper returned `{ success: false }` into a console nobody reads.

- **Blast radius:** every one of 42 refund call sites, since the function was
  written. Three months of production contained **exactly one** refund row, and
  that one was inserted by hand during the domain move.
- **Fix:** resolve workspace + cost from the job's own **spend row** (not
  `creative_jobs` — several callers refund a job whose `creative_jobs` insert is
  the thing that just failed, so that row may be absent). No spend row → decline
  rather than mint credits. `lib/credits/refund.ts`.
- **Verified live:** 38 stranded credits returned; second call a no-op;
  `cached_balance` == `SUM(credit_transactions)`.
- Commit `cc0eec9`.

### ✅ 3. The stalled-job sweep reported refunds it never made

The 15:31 cron run logged `refunded=3 creditsRefunded=38` and moved nothing —
it tallied `credits_charged` without checking whether `refundCredits` succeeded,
and also counted jobs whose claim race it **lost** to a webhook. The one report
you would check to catch a broken refund was the report that couldn't.

- **Fix:** `failAndRefund` returns what actually happened and the caller tallies
  from that. A refund that fails after the job is claimed is written onto the
  job (`REFUND FAILED, N credits still owed`) so it's findable by query, and
  counts as `errored`. `lib/jobs/sweep.ts`.
- Commit `a72b23a`.

### 🟡 4. A poller races the webhook and duplicates images

**Found by walking a real campaign.** `GET /api/campaigns/[id]` — which Studio
polls while generating — treats any job `processing` for >20s as stuck and calls
`fetchAndProcessFalJob`. That path saved assets while the webhook did the same.

`fetchMultiImage` *did* dedupe, but against a **snapshot** of existing assets
read once at the top, before spending 10+ seconds downloading and re-uploading.
Every webhook landing inside that window was invisible to it.

- **Evidence:** campaign `f066c74f`, 6 of 8 directions have two assets each with
  the **same `request_id`** and one webhook log row; all six duplicates share
  the insert timestamp `16:57:12.496977` — the poller's single batch write.
- **Blast radius:** **8.5% of all image requests** (18 surplus assets). Any
  generation slower than 20s is exposed; mine took ~23s.
- **Fix:** both paths now claim the same unique row in
  `webhook_logs (source, event_id)` *before* doing work, so exactly one owns a
  request. Claims are released on every failure path, or the next webhook would
  be turned away and the image lost. A snapshot can't fix a race; a claim can.
- The old code carried the comment "assets may be duplicated — that's
  acceptable". At 8.5% it isn't.

### 🟡 5. Captions invented a brand name and pre-filled the publish box

`businessName` was fed the campaign's **auto-generated project name**, so a
caption read *"**Bright Canvas** hot sauce is small-batch for a reason"* —
Bright Canvas being a name the app made up seconds earlier. That copy
auto-populates the Publish caption field, so a fabricated brand sat one click
from a real social account.

- Three callers were wrong: `CaptionCanvas` → `campaignName`,
  `foreman/execute` → `ctx.campaignName`, `comments/suggest` →
  `session.workspaceSlug` (an account handle — "iamgadgetboy hot sauce").
- **Fix:** `businessName` is optional; absent, the prompt explicitly forbids
  inventing one. Resolved **server-side** from `workspaces.brand_name` in
  `/api/jobs`, never from the request body — a brand name is a property of the
  workspace, not something a caption request gets to assert.
- Deliberately does **not** fall back to `workspaces.name`/slug: those default
  to the signup handle, and publishing that is the same failure as inventing.

---

## 🔴 Open

### 🔴 6. Nav dots mean two different things in the same colour

`done` is `bg-emerald-500`; "now unlocked" is `animate-pulse bg-emerald-500`.
Identical hue, distinguished only by a pulse. Picking an anchor turns Video,
Caption, Compositor and Publish green at once — indistinguishable from "you
already made these". `Studio.tsx`, `justUnlocked`.

### 🔴 7. The image count doesn't agree with itself

The empty state promises "your **six** options"; the job submits **8**
directions; **14** assets arrived (see #4). `expected_images: 8` also means
`finalizeMultiImage` completes the job at 8 while more are still landing —
which is why the strip counted 12, then 14, after it said "Completed".

### 🔴 8. The Publish screen has no preview

You are one click from posting an ad and the image appears nowhere on that
screen. Header also reads "Ready — publish" (green) while the button reads
"Publish · 0 platforms" and is disabled.

### 🔴 9. Credit badge goes stale

Image generation decrements it correctly (106411 → 106399). The caption's
1 credit never updated the header — displayed 106399, actual 106398.

### 🔴 10. Default image model mangles all text

Every generated bottle label was gibberish — "AUNCEAAN FLEANCE", "RAME FOOUCH
Côtlene HOTO". The default is Sharp/FLUX, which is weak at text. `IMAGE_MODELS`
already has "Typeset" (Ideogram), described as best-in-class for in-image text,
but it's Pro-gated. For any product with a label, the free default produces
output nobody can publish.

### 🔴 11. Smaller UI friction (from the walkthrough)

- Results grid is clipped — six tiles fill the pane, the rest are below the fold
  with no indication, and the "what next?" panel after picking an anchor is
  off-screen entirely.
- Layout jumps mid-wait: "Do the rest for me" appears *during* generation and
  shoves the prompt upward.
- The placeholder prompt reads like real content ("A coffee roastery
  overlooking the bay at golden hour…") directly above "Type a prompt above to
  enable Generate".
- The project renamed itself Bold Echo → Bright Canvas between two renders.

### 🔴 12. Compositor ops not folded into the three-pane rail

On `feat/three-pane-ad-studio` the Compositor still takes the full width and the
Ad stage stands down for it, because its inpaint mask is absolutely positioned
against its own canvas. See `components/studio/CLAUDE.md`.
