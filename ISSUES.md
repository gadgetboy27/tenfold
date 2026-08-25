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

### ✅ 4. A poller races the webhook and duplicates images

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
- Commit `22a7aae`.

### ✅ 5. Captions invented a brand name and pre-filled the publish box

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
- Commit `0cee5d5`.

---

## 2026-08-24 (later) — flow & engagement pass

### ✅ 13. Finished images were held back behind a spinner

The single biggest drop-off risk found. `poll()` fetched `camp.assets` every
1.5s — it **already had the images** — but only called `setAssets` once
`camp.status === "ready"`.

- **Measured across production:** first result lands at **~23s**, the batch
  completes at **~45s**. So there were **~22 seconds** where finished options
  sat in hand, undisplayed, behind "Painting your options…". That dead air is
  where people leave.
- **Fix:** each option renders the moment it lands; a live line above the grid
  reports `N options ready — still rendering the rest…` so a half-full grid
  reads as progress, not as the final answer.
- No denominator on purpose — see #7; the count is the tier's `maxVariations`
  and the hardcoded "six" was already wrong.

### ✅ 14. "Six options" was hardcoded and untrue

Empty-state copy promised six. The real count is `ent.maxVariations` (this
account submits **8**). Copy is now count-agnostic.

### ✅ 15. Picking an option looked like it did nothing

"What would you like to do next?" renders *below* a grid of up to a dozen
images, so on a normal screen the one moment the flow hinges on — choosing
your image — produced no visible change. Now scrolled into view on pick.

### ✅ 6. Nav dots meant two different things in the same colour *(was open)*

`done` and "now unlocked" were both emerald, separated only by a pulse. Picking
an anchor lit up Video, Caption, Compositor and Publish at once,
indistinguishable from work already done. Now: **solid dot = done**, **hollow
ring = available next**, plus a title tooltip on each.

### ⚪ Logos are NOT slow — that was this bug, not render time

Worth recording because the assumption keeps resurfacing. Measured from
`creative_jobs`: `logo_concepts` renders in **~17 seconds** (submit 13:54:44 →
last webhook 13:55:01) and `logo_finalize` in **15.6s**. The only
`logo_concepts` row showing 4567s is the job recovered by hand, not a render.

Logos *felt* like they took forever because of #1 — they never completed at
all, and the UI had no way to say so. The fix was correctness plus feedback,
not speed. For reference, the genuinely slow jobs are video: `video_10s`
median 91s, `video_15s` median **342s**.

---

## 🔴 Open

### 🔴 7. The image count doesn't agree with itself *(partly addressed by #14)*

`done` is `bg-emerald-500`; "now unlocked" is `animate-pulse bg-emerald-500`.
Identical hue, distinguished only by a pulse. Picking an anchor turns Video,
Caption, Compositor and Publish green at once — indistinguishable from "you
already made these". `Studio.tsx`, `justUnlocked`.

Copy no longer claims six, and #4 stopped the duplicates. Still open: the job
submits `maxVariations` directions but `expected_images` lets
`finalizeMultiImage` mark the job complete while more are still landing, so
the strip count can still climb after it says "Completed".

### ✅ 8. The Publish screen has no preview *(fixed)*

You were one click from posting to real accounts and the thing being posted
appeared nowhere on the screen. A preview now sits at the top of the publish
column, showing whichever asset `target` will actually send (video or image),
so the target picker and the preview stay in step, plus a "view full size"
link.

Still open, same screen: the header reads "Ready — publish" (green) while the
button reads "Publish · 0 platforms" and is disabled — contradictory signals.

### 🔴 9. Credit badge goes stale

Image generation decrements it correctly (106411 → 106399). The caption's
1 credit never updated the header — displayed 106399, actual 106398.

### ✅ 10. Default image model mangles all text *(fixed)*

Every generated bottle label was gibberish — "AUNCEAAN FLEANCE", "RAME FOOUCH
Côtlene HOTO" — from a brief that never mentioned text.

The fix is deliberately NOT a new global default. FLUX is the better
photographic model and most briefs contain no lettering; changing it for
everyone would trade good output on the common case for good output on the
rare one. Instead `lib/fal/text-in-image.ts` detects a brief that WILL produce
lettering and routes that one job:

- **Pro → "Typeset"** (Ideogram), best-in-class typography.
- **Free → "Fusion"** (Nano Banana), which handles in-image text, is **not**
  Pro-gated and costs the **same 12 credits**. No upgrade wall and no surprise
  on the invoice, which is what makes it safe to do automatically — and the
  free tier is exactly where unusable output loses a signup.
- An **explicit** model choice is always honoured; auto-switching under someone
  who deliberately picked a model overrides an instruction, which is worse than
  the garbled text.
- The switch is announced in the UI. A look that changes between runs with no
  explanation is its own bug.

Detection covers explicit signals (quoted phrases, "sign", "poster", "logo",
"says"…) **and** packaged goods — nobody writes "with a legible label", they
write "three bottles on weathered timber", and the model letters them anyway.

### 🔴 11. Smaller UI friction (from the walkthrough)

- Results grid is clipped — tiles fill the pane and the rest are below the fold
  with no indication. (The "what next?" half of this is fixed — see #15.)
- Layout jumps mid-wait: "Do the rest for me" appears *during* generation and
  shoves the prompt upward.
- The placeholder prompt reads like real content ("A coffee roastery
  overlooking the bay at golden hour…") directly above "Type a prompt above to
  enable Generate".
- The project renamed itself Bold Echo → Bright Canvas between two renders.

### ✅ 16. Generation rail was clipped and unscrollable *(fixed)*

First look at the merged three-pane layout in production: the rail was clipped
at the top with no way to scroll back up — the "Write a prompt / Import from
website" tabs were on screen but unreachable. `CockpitCreate` still carried
`h-full` plus `overflow-y-auto` on both inner panels, laid out for the old
full-width `<main>`. A fixed-height child with its own scroller inside a
scrolling parent pins its top out of reach. One scroller now: the rail.

**Rule:** panels inside the rail size to their content. Do not give them
`h-full` or their own `overflow-y-auto`.

### 🔴 17. Publishing an image drops every overlay — no still-image export

**The most significant gap found. Discovered by walking the full flow:**
image -> caption -> Add to ad -> Publish.

The Ad stage composes correctly and the layer lands. Then the Publish preview
shows the RAW image with no caption on it — because that is genuinely what
gets posted.

- `PublishCanvas` sends `body.assetId = anchorId` for an image publish and
  never a `compositionId`.
- `/api/publish` *does* prefer "the composition's output"... but that output
  only exists for **video**. `/api/compositions/export` renders layered docs to
  MP4 via FFmpeg; there is **no still-image equivalent** anywhere.

So the whole point of the three-pane shell — build an ad out of layers — does
not survive a photo post. Video is fine.

Fixing it properly means a server-side renderer that flattens a
`CompositionDoc` to a still, and it has to agree with BOTH the canvas preview
and the FFmpeg export or the published ad won't look like what was designed.
That's a feature, not a wiring fix, so it is not attempted here.

**Shipped meanwhile:** the publish preview shows the true asset (which is how
this surfaced), plus an explicit warning naming how many overlays will be
dropped and pointing at video as the path that does composite. Better a screen
that admits the limit than one that silently discards the user's work.

### 🔴 19. An 83-credit auto-run started that I did not intend to trigger

During the layers test, a full foreman run appeared on the **Sunlit Bloom**
campaign — not the one being worked in — and spent **83 credits**:

| stage | credits |
| --- | --- |
| image_generation | 12 |
| video_10s | 62 |
| music_generation | 8 |
| script_generation | 1 |

Run `95605974-…`, created `19:45:10`, now `awaiting_publish` — so it will NOT
post anything on its own, and nothing was published.

What is known: the only code path that creates a run is
`POST /api/campaigns/run` with `confirm: true`, called from `AutoRunPanel`'s
`start()` behind an explicit button. `AutoRunPanel` has no auto-start on mount,
and `advanceRunForJob` only advances a run that already exists. So this should
have required a deliberate click on "Do the rest for me" → confirm.

I cannot attribute it to a click I intended to make, and I was not interacting
with the browser at 19:45. Either a click landed on the confirm button as the
layout shifted, or something else can start a run. **Worth finding out**: a
flow that can spend 83 credits — over half a Creator month's allowance — with
no clear user intent is exactly the complaint that loses an account.

Related and probably contributing: the Generate button moves vertically when
the "Type a prompt above to enable Generate" hint disappears and the "Do the
rest for me" card appears mid-generation. A click aimed at one control can
land on another. (Also noted in #11.)

### ✅ 18. `video-segments.test.ts` flakes under load *(fixed)*

Passes 2/2 in isolation and in a quiet full run, but timed out at 5000ms
during a full run on a loaded machine (56s vs the usual ~20s). It does real
async work against a 5s default timeout, so it will flake in CI on a busy
runner and read as a regression that isn't one. Needs an explicit longer
timeout or fake timers. **Fixed:** both cases now carry an explicit 20s
timeout. It had already masked real signal twice — the worst kind of flake,
because it trains you to ignore red.

### 🟡 20. All six marketing networks now publish direct — awaiting credentials

Of the six networks that actually matter for marketing, four were already
direct: **Facebook, Instagram** (Meta Graph) and **Reddit, Pinterest** (own
OAuth apps). **LinkedIn** is now built the same way — `lib/social/direct/
linkedin.ts`, connect + callback routes, dispatcher entry, UI routing.

**Needs before it works:** a LinkedIn app with *Sign In with LinkedIn using
OpenID Connect* + *Share on LinkedIn*, redirect
`{APP_URL}/api/social/callback/linkedin`, and `LINKEDIN_CLIENT_ID` /
`LINKEDIN_CLIENT_SECRET` in Railway. Until those exist the connect route
answers 503 saying so.

**Honest limits, both deliberate:**
- **Member feed only.** Company Pages need LinkedIn's Community Management
  review. Adding them later is a scope change plus an organization URN.
- **No video.** LinkedIn video uses a separate upload flow with its own
  processing wait; it refuses rather than posting the caption alone.
- **Not verified against the live API** — every other adapter here was written
  against a working developer app and this one couldn't be. A 400 from
  `/rest/posts` or `/rest/images` means check that file first.

**TikTok and YouTube are now built too** — same pattern, both video-only
(`IMAGE_CAPABLE` is the new inverse of `VIDEO_CAPABLE`). Neither is verified
against its live API, for the same reason as LinkedIn.

Nothing but approvals now stands between these and working:

| network | needs |
| --- | --- |
| LinkedIn | app + `LINKEDIN_CLIENT_ID/SECRET`. Member feed only; no video |
| TikTok | app + `TIKTOK_CLIENT_KEY/SECRET`, **app audit** (else SELF_ONLY only), **domain verification** for PULL_FROM_URL on the Supabase Storage host. Video only |
| YouTube | Google project + `YOUTUBE_CLIENT_ID/SECRET`, **OAuth verification** (restricted `youtube.upload` scope). Video only; defaults to unlisted; ~6 uploads/day on default quota |

**Only X, Threads, Snapchat, GMB and Telegram remain Ayrshare-only** — the
"fluff" tier. With Ayrshare gated off they show the honest unavailable state
(#​: see the Ayrshare gate commit) rather than a dead Connect button.

### ✅ 21. "Video isn't working" — it was, the UI gave up first *(fixed)*

Reported after two failed attempts. Both attempts had in fact **succeeded**:
valid stitched MP4s, HTTP 200, ~75MB each, sitting in storage.

The UI polled `160 x 2s = 320s` and then reported failure. Measured across
production:

| type | median | runs over the 320s bound |
| --- | --- | --- |
| `video_15s` | **342s** | **4 of 6** |
| `video_10s` | 115s (max 500s) | 2 of 24 |
| `video_30s` | 143s (max 327s) | 1 of 18 |

So the timeout sat **below the median finish time for 15s video** — the most
common outcome for that length was a good render reported as a failure. The
reported 30s attempt missed by 8 seconds (328s vs 320s).

- **Fix:** bound raised to `450 x 2s = 15 minutes`, comfortably past the 500s
  slowest observed. Polling longer is free — the job is queued server-side
  regardless and each tick is one cheap status read.
- Stage labels stopped at 80s, so a normal render spent five minutes on
  "Finishing the cut…", which reads as a hang. They now run to 420s and say
  plainly that video takes minutes.
- The timeout message described the routine case as if it were an anomaly; at
  15 minutes it now genuinely is one.
- `tests/unit/video-poll-bound.test.ts` pins the bound against the slowest
  observed render **with 1.5x headroom** — the old margin failed by 8 seconds,
  and a thinner margin means the next slightly slower model silently brings the
  bug back.

### 🔴 22. Rendered videos are ~75MB for 30 seconds

Both completed renders were ~75MB — roughly 20 Mbps for short-form social
video, several times what the platforms themselves re-encode to. That is slow
to buffer in a `<video>` tag, which makes a working video *look* broken, and it
is a real storage and egress cost per render. Worth an encode pass
(bitrate/CRF cap) in the concat step.

### ✅ 23. Full-frame compositing ops stacked instead of replacing *(fixed)*

Traced from "Bright Pulse": two copies of the same photo, the top one
apparently undeletable.

`softGlow` transforms the WHOLE frame, but every op result was added as a new
image layer at 0.5/0.5 — so the glowed copy sat on top of the original. And it
arrived `locked: true` ("protects the finished step"), which makes a layer
click-through on the canvas, so it couldn't be selected to delete. Protecting
the step cost the user control of it.

**Fixed:** ops that return a transformed copy of the whole frame
(`inpaint`, `relight`, `blend`, `textureOverlay`, `gradientMerge`, `softGlow`)
now REPLACE what they were applied to — the selected layer, or the background.
Only `cutout` still adds a layer, because only it produces a new element to
place. Results are no longer auto-locked.

Known trade-off: a background carries no `producedBy`, so replacing it loses
the "Redo this op" affordance a layer kept. Two stacked copies is the worse
outcome and the op panel is right there.

### 🔴 24. Publishing to Facebook fails on a pre-scope connection

"Bright Pulse" couldn't publish. Meta returned:

> Any of the pages_read_engagement, pages_manage_metadata,
> pages_read_user_content, pages_manage_ads, pages_show_list or
> pages_messaging permission(s) must be granted before impersonating a user's
> page.

The connection dates from **2026-07-07** and predates the current scope list
(`pages_show_list`, `pages_manage_posts`, `pages_read_engagement`). A stale
grant keeps working for reads and fails only at the moment someone posts — so
it surfaces at the worst possible time, as a wall of Facebook constants.

**Partly fixed:** `actionableError()` in the publish route now translates this
into "reconnect it in Settings → Social, and make sure the Page is ticked".
**The connection itself still needs reconnecting by the user** — no code can
re-grant a permission.

### 🔴 25. A finalized logo is never adopted as the brand mark

Also from "Bright Pulse": the logo banner never appeared because there was no
logo to place — `brand_kits.logo_url` is null even though a logo was finalized.
`POST /api/logo/[id]/use-as-brand` exists and nothing prompts anyone to call
it, so finishing a logo leaves it sitting in Logo Studio while every ad that
would use it has nothing to stamp.

Related: `brand_kits.tagline` currently holds a **200-character paragraph**
scraped by brand import, not a tagline. Applying the brand would stamp that
whole paragraph onto the ad as text.

### 🔴 12. Compositor ops not folded into the three-pane rail

On `feat/three-pane-ad-studio` the Compositor still takes the full width and the
Ad stage stands down for it, because its inpaint mask is absolutely positioned
against its own canvas. See `components/studio/CLAUDE.md`.
