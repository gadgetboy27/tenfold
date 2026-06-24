# Parked idea: custom music for video posts

**Status:** Parked (revisit after launch validation) · Logged 2026-06-24

## The idea
Let users put **better music** on their video posts than the built-in AI generator
(`fal-ai/stable-audio`), whose output is low quality ("not symphony quality"). Two
forms, ideally phased:

1. **User-uploaded music** — the user supplies their own track (brand music, an
   original, or something they've licensed).
2. **Curated royalty-free library** — a small set of pre-cleared tracks to pick
   from. Safer, and a quality upgrade over the AI music. The better long-term
   default until the AI music model improves.

## Why it's low-effort technically
The plumbing already exists, so "tracking the music to the video" is **not** a new
problem — it's tracked **per campaign**, same as every other asset:
- The `assets` bucket now accepts audio (`audio/wav` / `audio/mpeg` /
  `application/octet-stream`) — fixed 2026-06-24.
- The publish-time **cinema mix already grabs the campaign's latest `audio`
  asset** and muxes it onto the clip (`app/api/publish/route.ts`, `preferVideo`
  branch → `composeVideo`).
- There's an existing upload pattern (`app/api/uploads/image`) to mirror for audio.

So the add is roughly: an "upload music" control on the Step 3 Music card →
upload to Supabase → insert an `audio` asset on the campaign → the mix picks it up
automatically. Small, well-scoped.

## ⚠️ The real risk: copyright (this is the actual landmine)
If a user uploads a **commercial song** and we publish it to Facebook/Instagram,
**Meta's Content ID will mute, block, or take down the post** — and it's a **legal
liability** for tenfold. This, not the wiring, is why the feature needs care.

Mitigations:
- **Upload + a "I confirm I own/licensed the rights to this audio" checkbox** —
  quick; covers brand/original music; pushes liability to the user. Minimum bar.
- **Curated royalty-free library** — sidesteps copyright entirely *and* fixes the
  "meh AI music" quality problem. The cleaner product answer.

## Suggested phasing
1. **Don't build yet.** Ship and watch whether anyone even cares about audio on
   their videos (the AI music is already low-value — validate demand first).
2. If users ask → **upload + rights-confirmation checkbox** (~half-day add).
3. Then → **curated royalty-free library** as the upgrade / better default.

## Pointers (where it would touch)
- Music card UI: `components/steps/Step3Expand.tsx`
- Upload pattern to mirror: `app/api/uploads/image/route.ts`
- Mux that consumes the audio: `app/api/publish/route.ts` (`preferVideo`) +
  `lib/composition/video.ts`
- AI music model (the thing this routes around): `lib/fal/models.ts`
  (`music_generation: fal-ai/stable-audio`)
