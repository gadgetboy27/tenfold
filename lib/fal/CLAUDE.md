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

**Proposed, not built:** this gate governs which *model* gets called within
fal.ai. `PRODUCT_STRATEGY.md` §4 proposes a `ModelRouter` layer above this —
which *provider* gets called (fal.ai vs. Replicate/RunPod), so a pricing or
availability change on fal isn't a job-queue rewrite. Nothing here implements
that yet; `enqueueJob`/`enqueueWithFallback` are fal-specific today.
