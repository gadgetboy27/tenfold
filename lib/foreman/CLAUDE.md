# lib/foreman — the orchestrator ("one prompt, hands off until publish")

**Status: complete and dark-launched behind `FEATURE_FOREMAN`.** Never run in
anger — the code paths below are tested but no real end-to-end run has been
executed against fal. Treat the first one as a supervised experiment.

## The mission

`CLAUDE.md` §1 describes a pipeline the app already performs — images, anchor,
video, music, caption, compose, publish — but every step is a separate user
action driven from `Studio`'s local React state. Nothing chains. The generators
all exist and work; what's missing is something that holds a plan, knows which
step is in flight, and survives the browser closing.

## What exists

- **`plan.ts`** — pure and tested. `RUN_STAGES`, per-stage cost, `quoteRun()`,
  `buildStages()`, `nextStage()`. The quote a user is shown comes from the same
  structure that will drive execution, so the two cannot disagree; costs are
  read from `CREDIT_COSTS` and the tests assert the total against that source
  rather than a literal, so a reprice can't silently make the quote lie.
- **`campaign_runs`** (migration `0029`) — durable run state. Durable because
  fal jobs are webhook-driven and a run spans minutes; holding the chain in
  React state would mean a refresh abandons a campaign the user has paid for.
  `stages` is both plan and log, so a partially-failed run is readable without
  joining `creative_jobs`.
- **Caption → publish is wired** (was a documented gap). `CaptionCanvas` lifts
  its result to `Studio`, which passes it to `PublishCanvas` as
  `initialCaption`. Adopted only while that field is untouched — overwriting
  something the user typed there would be worse than making them paste.

## How a run advances

- **`execute.ts`** runs one stage. Synchronous stages (`anchor`, `caption`)
  complete inline and the loop continues; async stages (`images`, `video`,
  `music`) submit a fal job and stop. `driveRun` walks until it hits an async
  stage or finishes.
- **`advance.ts`** is called from the fal webhook when a job completes. Async
  jobs carry `runId`/`runStage` in `creative_jobs.input_params`, so no schema
  change was needed to identify them.
- **`buildFalInput` was extracted** to `lib/fal/build-input.ts` and is now
  shared by `/api/jobs` and the foreman. Duplicating it would have meant an
  orchestrated run silently diverging from a manual one the first time a prompt
  or model input changed.

## Credit and failure semantics

Debit per stage, never in a batch: a run that dies at stage 3 must not have
charged for 4 and 5. Each stage follows CLAUDE.md §1/§6 exactly — debit before
the job exists, `refundCredits` if submission throws.

A failed stage **stops the run** rather than pressing on. Later stages depend on
earlier output (video needs the anchor; music is sized to the video), so
continuing would spend credits producing something incoherent.

The API refuses up front when the balance can't cover the quote, rather than
failing three stages in and leaving a half-built campaign with a confusing
ledger.

## Still a placeholder: anchor selection

`pickAnchor` takes the earliest image. That's a placeholder, not a judgement.
The interesting option is `style_performance()` (migration 0025), which already
ranks a workspace's styles by real engagement — CLAUDE.md §10 notes nothing
feeds it back into generation, and this is the obvious place to close that loop.
Doing it without measuring whether it beats "first" would be guessing, so the
seam is left explicit.

## Why the webhook touch is safe

`advanceRunForJob` is the only shared-code change. It returns immediately unless
`input_params.runId` is present — for all existing traffic it is a property read
and a return, with no client constructed. It is additionally flag-gated, and it
never throws: the webhook's contract is to record the asset, and a broken run
must not cost us that. All three properties are asserted in
`tests/unit/foreman-advance.test.ts`.

## Two decisions already made, worth keeping

**The run stops before publishing.** `RUN_STAGES` has no `publish` entry and a
test asserts it never gains one. The FAQ promises "nothing goes out on its
own"; an orchestrator that posts to 13 platforms unattended breaks that for the
sake of one click. A finished run lands in `awaiting_publish` with everything
assembled.

**Video is the cost.** A default run is ~83 credits and video is roughly 75% of
it. `RunOptions.includeVideo` exists so a cheap run is possible, and the quote
is itemised rather than a single total — the user should see *why* it costs what
it does before committing.

## Why the executor is a separate change

Steps 1 and 2 above both touch the live generation path — `app/api/jobs`'s
`buildFalInput` and the fal webhook, which processes every generation for every
user. That is the most load-bearing code in the app. It should land as its own
reviewed change with its own verification, not bundled into a large commit at
the end of a long session. Today's session found three separate bugs
(`/guides` 307, the brief route's 401-not-404, stale logo prices) that all came
from exactly that pattern.
