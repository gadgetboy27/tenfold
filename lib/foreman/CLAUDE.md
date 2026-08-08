# lib/foreman — the orchestrator ("one prompt, hands off until publish")

**Status: foundation built, executor NOT built.** Read this before assuming a
run can actually run.

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

## What does NOT exist yet

1. **The executor.** Nothing starts a stage. Needs: debit → insert
   `creative_jobs` → enqueue, per stage.
2. **Webhook advance.** `app/api/webhooks/fal/route.ts` saves assets and marks
   jobs complete; it has no concept of "this job belongs to run X, start stage
   Y". Plan: carry `runId`/`runStage` in `creative_jobs.input_params` (no schema
   change) and advance from `handleSuccess`.
3. **Anchor auto-selection.** Something must pick 1 of 6. The interesting option
   is feeding `style_performance()` back into the choice — `CLAUDE.md` §10 notes
   nothing currently does — but v1 can pick the first and let the user change it.
4. **Failure semantics.** If stage 4 of 5 fails, what happens to the run, the
   partial campaign, and the credits already spent? Single jobs refund cleanly;
   a chain has no equivalent yet.

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
