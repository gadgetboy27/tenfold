# lib/brief + lib/learning — the guided brief, and what we learn from use

Two separate things that arrived together and must not be conflated.

## lib/brief — the guided brief (slice 1)

Dark-launched behind **`FEATURE_BRIEF_AGENT`**. Everything gates on it:
`app/api/campaigns/brief` 404s when off, and `BriefAgentPanel` is never
rendered (the flag is read in the server page and passed to `Studio` as
`briefAgentEnabled` — never import `lib/flags` into `"use client"` code).

This is step one of the one-prompt→published work. It ships alone because a
better brief improves every generation **today**, with no orchestration built.

**The rule that shapes the whole design: nothing it returns is a gate.** The
product's current strength is that a bare sentence works. Generate stays
enabled at all times; the panel only ever suggests. If this becomes a form
someone must complete first, it has made the product worse than what it
replaced. That's why the model prompt caps gaps and asks at 3 each, and why
`improvedPrompt` must be usable with no further input.

The route is **deliberately free** — unlike every other Claude route here.
Charging someone to be told their prompt is vague is hostile, and the value
depends on it being used every time. Cost is ~1 US cent per call; abuse is
capped by `withWorkspace`'s rate limit. Consequence: there's no
`debitCredits`, so per `app/api/CLAUDE.md` there's no `creative_jobs` row
either. **If this ever becomes chargeable, the job-row pattern must be added
in the same change**, or refund-on-failure silently doesn't exist.

Not built yet (slices 2–5): wiring the asset asks to the actual upload
surfaces, the intent→generator router, the orchestrator with a budget guard,
and sketch/reference-design intake. See the session notes — the workers all
exist as routes; the foreman doesn't.

## lib/learning — how people work, never what they make

`decision_events` (migration `0028`) records **workings, not work**: how many
options someone views before committing, whether they refine or restart, which
steps they skip, where they stop. That's what could eventually justify a
sensible default or a suggested next step. What their ad *says* is not needed
for any of it.

`sanitise()` enforces the boundary structurally rather than by convention:
numbers, booleans and short single-token labels survive; anything with a space
or over 40 characters is **dropped entirely, not truncated** — a truncated
prompt is still a prompt. `tests/unit/learning-record.test.ts` asserts that
prompts, captions, business names and asset URLs all sanitise to `{}`. If you
find yourself wanting to add prompt text "just for context", that test is the
argument against it.

`recordDecision` never throws and is always called with `void` — analytics
must never break or slow the thing it measures.

**Privacy:** `app/privacy/page.tsx` currently says only "basic analytics".
Behavioural capture is arguably a step beyond that phrase. Worth making the
policy explicit before this data is used for anything beyond internal product
decisions.
