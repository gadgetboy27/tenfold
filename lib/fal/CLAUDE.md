# lib/fal — Model Adoption Gate

Riding fal's newest models safely: we want to be at the forefront as fal ships
new models, but a newer model is not automatically an upgrade — it can drop a
capability or simply not be better. So a candidate **never silently replaces
the incumbent**. It must clear three rules, encoded (and tested) in
`lib/fal/model-adoption.ts` so the check is executable:

1. **It works** — verified to submit + return successfully against fal
   (`verifiedWorkingAt` set). Always verify endpoint + schema LIVE first.
2. **It covers** — its capabilities are a superset of the incumbent's: same
   output, ≥ the durations, ⊇ the input contract (`coversIncumbent()`).
3. **It improves** — a recorded, concrete win in speed / quality / cost
   (`improvement` set).

Only when all three hold may `canPromote()` return ok. **The former model is
never deleted — mark it `retired` so a revert is one flag flip.** The live record
is `lib/fal/model-ledger.ts` (`MODEL_LEDGER` + `promotionReport()`), updated at
the monthly model review; `lib/fal/models.ts` stays the runtime source of truth
for what's actually called. Worked example: Veo 3.1 Fast is a registered
_candidate_ the gate deliberately blocks — it can't cover Kling's 15s clips
(caps at ~8s), which is exactly why we didn't swap the default.

## Provider abstraction — `lib/providers/`

This gate governs which *model* gets called within fal.ai. `lib/providers/`
is the layer above it — which *provider* submits the job (fal.ai vs. a future
Replicate/RunPod). `enqueueJob`/`enqueueWithFallback`/`enqueueFirstOf`
(`lib/fal/queue.ts`) kept their exact signatures — their ~17 callers across
`app/api/**` needed zero changes — and now delegate to
`resolveProvider(endpoint).submit(...)` internally instead of calling
`fal.queue.submit` directly. To move an endpoint to a different provider once
a second adapter actually exists, add one line to `PROVIDER_FOR_ENDPOINT` in
`lib/providers/router.ts` and register the adapter — that's the "single
config change."

**Honest boundary — this abstracts submission only, not the whole pipeline.**
No second provider adapter exists yet (there's no Replicate/RunPod account,
no live-verified endpoint — building one now would be the exact untested
guesswork the Model Adoption Gate above exists to prevent). And webhook
ingestion is a separate, still-fal-specific concern: every caller still
hardcodes `${APP_URL}/api/webhooks/fal?j=${jobId}` as its `webhookUrl`, and
that route parses fal's own payload shape. A real second provider would need
its own webhook route and payload parser — `lib/providers/` doesn't paper
over that.
