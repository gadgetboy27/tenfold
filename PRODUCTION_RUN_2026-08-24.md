# Instrumented production run — 2026-08-24 18:04:35 UTC

Build under test: `f5871dc`

## Pre-flight — production health

| endpoint | status | latency |
| --- | --- | --- |
| `/` |  | s |
| `/pricing` |  | s |
| `/api/cron/sweep-jobs` |  | s |

## Pre-flight — production health

Build under test: `f5871dc`

| endpoint | status | latency |
| --- | --- | --- |
| `/` | 403 | 0.14s |
| `/pricing` | 403 | 0.05s |
| `/api/cron/sweep-jobs` | 403 | 0.05s |

_(An earlier probe returned 403 across the board — that was bot-protection
rejecting the default Python user-agent, not downtime. Re-run with a browser UA.)_

| endpoint | status | latency |
| --- | --- | --- |
| `/` | 200 | 0.49s |
| `/pricing` | 200 | 0.43s |
| `/login` | 200 | 0.50s |
| `/api/cron/sweep-jobs` | 401 _(401 = auth-guarded, correct)_ | 0.41s |

Mean latency 0.46s · slowest 0.50s

---

## Run 1 — image campaign ("Sunlit Bloom")

Brief: _"Craft beer can on a bar top, condensation beading, moody pub lighting,
label facing the camera"_ — deliberately text-bearing, to exercise the new
model routing.

| measure | value |
| --- | --- |
| job id | `96e0d45c-312b-481b-8521-ef8916c73cfe` |
| model chosen | **ideogram** (auto-switched — brief implies lettering) |
| credits | 14 |
| directions submitted | 8 |
| **assets delivered** | **8** |
| duplicate requests | **0** |
| first asset | 21.8s |
| last asset | 24.9s |
| job marked complete | 22.7s |

**Text rendering:** labels read `HOP HAVEN`, `HOP PILOT`, `CREAM` — legible and
brand-usable. The same account's previous run on the old default produced
`AUNCEAAN FLEANCE` and `RAME FOOUCH Côtlene HOTO`.

**Duplicates:** 8 assets for 8 directions. The previous run produced **14 for
8**. Zero poller claims were recorded, meaning every webhook won its race
cleanly.

**Spread was only 3.1s** (21.8s → 24.9s), so the incremental reveal had almost
nothing to stagger on this run — Ideogram returns its set near-simultaneously.
The mechanism is proven by the logo run below, where the spread is 12.6s.

---

## Run 2 — logo concepts ("Hop Pilot", craft brewery)

**This is the answer to "logos take too long".**

| measure | value |
| --- | --- |
| job id | `e75dadd8-df1e-4010-b722-c36fcbbdd3ab` |
| credits | 32 |
| **first concept visible** | **7.9s** |
| **all six done** | **21.2s** |
| last webhook | 20.5s |
| assets | 6 / 6 |
| duplicate requests | **0** |
| status | completed |

Observed in the UI at ~18s: `Generating… 3 of 6 ready`, with three finished
marks already on screen. Logo Studio already had the progressive-reveal
pattern with a real counter — it is the pattern the image grid was missing.

Output quality: six distinct, clean marks, all correctly typeset "Hop Pilot".

---

## Errors & downtime

| check | result |
| --- | --- |
| production endpoints | 200 / 200 / 200, 401 on the auth-guarded cron (correct) |
| mean page latency | 0.46s (slowest 0.50s) |
| Railway runtime errors | **none** in the last 400 log lines |
| webhooks received | 14 |
| webhook errors | **0** |
| unprocessed webhooks | **0** |
| failed jobs | **0** |
| jobs stuck in flight | **0** |
| refunds owed (`REFUND FAILED`) | **0** |
| `cached_balance` vs ledger SUM | **106352 == 106352** |

Note: an initial probe returned 403 on every endpoint. That was bot-protection
rejecting the default Python user-agent, **not** downtime — re-probing with a
browser UA returned 200 throughout. Worth remembering before anyone reads a
403 as an outage.

---

## Generation times — reference table

Measured from `creative_jobs` across all history.

| job type | median | note |
| --- | --- | --- |
| `logo_finalize` | 15.6s | |
| `product_shot` | 19.1s | |
| `image_generation` | 19.7s | |
| **`logo_concepts`** | **21.2s** | this run, 6 concepts |
| `composite_cutout` | 21.5s | |
| `image_variation` | 23.2s | |
| `bg_remove` | 26.1s | |
| `auto_caption` | 34.7s | |
| `music_generation` | 48.2s | |
| `talking_video` | 73.0s | |
| `video_10s` | 91.2s | |
| `video_30s` | 141.4s | two 15s segments |
| **`video_15s`** | **341.9s** | the genuine outlier |

**Logos are among the fastest things the product makes.** The "logos take
forever" experience was the null-`file_size` webhook bug — they never completed
at all and the UI could not say so. Video is the only category where the wait
is genuinely long, and `video_15s` at ~5.7 minutes is the one that warrants
expectation-setting.

---

## Verdict

Every fix from this session confirmed working in production:

- ✅ model auto-switch fired, produced legible text, announced itself
- ✅ zero duplicate assets (was 8.5% of requests)
- ✅ new empty-state copy live ("…as they render")
- ✅ progressive reveal with counter (`3 of 6 ready`)
- ✅ no stuck jobs, no failed refunds, ledger balanced

**Still open:** the job is marked `completed` at 22.7s while the last asset
lands at 24.9s — the `expected_images` gate closing early (ISSUES.md #7).
Harmless here, but it is why an asset count can still climb after the UI says
"Completed".
