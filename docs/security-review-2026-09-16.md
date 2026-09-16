# Security review — 2026-09-16

Whole-app pass: every API route (129), the middleware, webhooks, cron/ops
endpoints, public pages, uploads, outbound fetches, the AI prompt surfaces,
and dependencies. Findings are ranked; **Fixed** means shipped in the same
commit as this document, **Open** means deliberately deferred with the
reasoning. §5 is the design that makes the next review shorter.

## 1. What was already right

Worth stating so it isn't re-audited: every authenticated route verifies the
session server-side (`supabase.auth.getUser` on the bearer token or cookie);
workspace membership is resolved once and every tenant query spot-checked
filters `workspace_id` (ownership row first, then id-based writes); RLS is on
as the second layer; Stripe webhooks are signature-verified on the raw body;
ops/cron endpoints fail closed on a missing `CRON_SECRET` with a
constant-time compare; OAuth callbacks verify a signed `state` carrying the
workspace and user; social tokens are encrypted at rest; the public lead form
is IP rate-limited and drops unknown fields; the only `NEXT_PUBLIC_` values
are the Supabase URL/anon key, app URL and Sentry DSN; model outputs are
mostly consumed through forced tool calls with Zod schemas; the landing-page
generator has no image field at all so a model cannot emit a URL.

## 2. Findings

| #   | Severity              | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------- |
| 1   | **High**              | **SSRF.** Server-side `fetch` of user-chosen URLs with no address policy: the website importer (`analyze-url`), every composition source (`layers[].src`, `background.src` in a user-supplied doc → `export.ts`, `video.ts`, `concat.ts`, `image-card.ts`, `frames.ts`, `image.ts`, `video-image.ts`), and the fal webhook's result URLs. `http://169.254.169.254/` (cloud metadata) or an internal service was reachable, and a public host could redirect there. | **Fixed** — `lib/net/safe-url.ts`: `fetchPublic` resolves the name, refuses loopback / RFC1918 / link-local / CGNAT / multicast / v4-mapped v6 / `.internal` etc., and re-checks every redirect hop. Applied at all eleven sites. `ALLOW_PRIVATE_FETCH=true` (non-production only) for a local Supabase.                       |
| 2   | **High**              | **Unsigned fal webhook.** Accepted any POST naming a real job id + request id — both UUIDs visible to the job's owner. A forged "completed" payload made the server fetch an arbitrary URL and store it as the user's asset (with #1, from inside the network).                                                                                                                                                                                                    | **Fixed (warn mode)** — `lib/fal/webhook-signature.ts` verifies fal's Ed25519 signature against their JWKS with a 5-minute replay window. Outcome is recorded on every `webhook_logs` row as `_signature`. `FAL_WEBHOOK_STRICT=true` turns an unverified delivery into a 401 — set it once the log shows only `valid` (§4).    |
| 3   | **High**              | **Client-chosen upload content type.** All upload routes stored `contentType: file.type`. The bucket is public and serves what it stored, so `logo.png` sent as `image/svg+xml` with a scripted body was a page we host that runs script on `auth.prettymuch.nz`. Brand-kit logos also accepted raw SVG unchecked.                                                                                                                                                 | **Fixed** — `lib/uploads/content.ts`: type from the validated extension only; rasters sniffed with sharp (bytes must be the format the name claims); SVGs refused if they contain script, event handlers, `foreignObject`, animation, entities or remote references (checked after entity-decoding). Applied to `uploads/image | video | audio`, `talking-video/presenter`, `logo/vectorize`, `brand-kit/logo` (both paths). |
| 4   | **High (dependency)** | Next.js 16.2.4 carried a critical advisory set — middleware/proxy bypass, cache poisoning, RSC DoS, CSP-nonce XSS. sharp/libvips had high advisories.                                                                                                                                                                                                                                                                                                              | **Fixed** — `next@16.3.5`, `sharp@0.35.4`, plus `npm audit fix`. `npm audit --omit=dev`: 0 vulnerabilities. Full suite and production build green.                                                                                                                                                                             |
| 5   | Medium                | **CORS substring match.** `origin.includes("prettymuch.nz")` accepted `https://prettymuch.nz.evil.example` and reflected it. Not exploitable for data (bearer auth, no `Allow-Credentials`) but a check that passes for the wrong host is not a check.                                                                                                                                                                                                             | **Fixed** — exact-origin match, `Vary: Origin`, our own origin returned to unknown callers.                                                                                                                                                                                                                                    |
| 6   | Medium                | **Security headers only on `/api/*`** — the one place a browser renders nothing. Pages had no HSTS, frame denial or referrer policy. `X-XSS-Protection` (obsolete) was set.                                                                                                                                                                                                                                                                                        | **Fixed** — `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS on every response.                                                                                                                                                                                                               |
| 7   | Medium                | **Dev endpoints gated by `NODE_ENV` alone.** `dev/provision-workspace` (mints workspaces + credits, no auth) and `dev/grant-credits` were one misconfigured env var from live.                                                                                                                                                                                                                                                                                     | **Fixed** — both also require the ops secret.                                                                                                                                                                                                                                                                                  |
| 8   | Medium (AI)           | **Prompt injection via the imported website.** The scraped page text was inlined into the same user turn as the instructions, and the model's answer was `JSON.parse`d and cast, unvalidated, then returned to the client and used to build image prompts. A page saying "ignore your instructions…" could steer the brief; an oversized or off-shape answer flowed through.                                                                                       | **Fixed** — system prompt names `<website>` / `<client_notes>` as untrusted data; page content delimited; output validated by Zod (bounded lengths, angle count 1–6, goal enum with fallback) before use. Colours/font were already coerced.                                                                                   |
| 9   | Low                   | `ALLOW_PRIVATE_FETCH` and `FAL_WEBHOOK_STRICT` needed to be in the env schema and `.env.example`, or the next person can't find them.                                                                                                                                                                                                                                                                                                                              | **Fixed.**                                                                                                                                                                                                                                                                                                                     |
| 10  | Low                   | **No Content-Security-Policy.** The root layout injects an inline env script and structured-data JSON, so a real policy needs nonces (and Next 16.3.5 fixes the nonce XSS that made that risky).                                                                                                                                                                                                                                                                   | **Open** — §5.2.                                                                                                                                                                                                                                                                                                               |
| 11  | Low                   | **Legacy routes use `getSession` + admin client by hand** (≈75 of 129) rather than `withWorkspace`, so they get no rate limiting and rely on each author remembering the `workspace_id` filter. Spot-checks found no missing filter, but the guarantee is by inspection.                                                                                                                                                                                           | **Open** — §5.1.                                                                                                                                                                                                                                                                                                               |
| 12  | Low                   | **Stored SVG from the logo pipeline** (Recraft output) lands in the public bucket unscanned. The producer is a trusted API, not a user, so this is a note: apply `assertSafeSvg` in the webhook's SVG branch if that ever changes.                                                                                                                                                                                                                                 | Open — cheap, low value today.                                                                                                                                                                                                                                                                                                 |
| 13  | Low                   | **DNS rebinding** isn't defeated by #1's guard (resolve-then-fetch resolves twice). Needs a pinned-IP agent. Nothing in the threat model needs it yet.                                                                                                                                                                                                                                                                                                             | Open — noted in `safe-url.ts`.                                                                                                                                                                                                                                                                                                 |
| 14  | Info                  | Auth brute force is Supabase's rate limit, not ours (`/api/auth/login` proxies `signInWithPassword`). Adequate; the lead form has its own IP limiter.                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                                                                                              |
| 15  | Info                  | `/api/health?verbose=1` reports gate env vars behind the ops bearer only. Public `/api/health` reveals nothing.                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                              |

## 3. Non-breaking, on purpose

- `fetchPublic` refuses only addresses the app never legitimately fetches
  (private, loopback, metadata). Supabase storage, fal media, fonts, every
  social API — public, unaffected. Redirects still follow (up to five,
  re-checked). `ALLOW_PRIVATE_FETCH` covers a local Supabase.
- Signature verification **processes** unverified deliveries by default and
  only records the outcome. Nothing stalls if fal changes headers; the log
  shows it first.
- Upload types: a real PNG named `.png` is unchanged. What's refused is bytes
  that lie about their name, and SVGs that script — neither is a working
  feature.
- CORS: the app's own origin and localhost in dev — the only callers that
  ever passed the old check honestly.
- Next/sharp upgrades: 841 tests and the production build pass on the new
  versions; `campaign-pdf.ts` (browser-side, uses the browser's fetch) was
  left as it was.

## 4. Follow-through — do these, in order

1. **Watch `webhook_logs`** for a day: `select payload->>'_signature', count(*)
from webhook_logs where source='fal' and received_at > now() - interval
'1 day' group by 1`. When it reads only `valid`, set
   `FAL_WEBHOOK_STRICT=true` on the `tenfold` Railway service.
2. Rotate `CRON_SECRET` and `SOCIAL_TOKEN_KEY` on a calendar (they never have
   been); the fal/Anthropic/Stripe keys on any staff change.
3. Re-run `npm audit --omit=dev` monthly; the framework moves.

## 5. The better way — design changes that remove classes of bug

### 5.1 One request wrapper, no exceptions

`withWorkspace` already exists and does the right things: session → membership
→ a `db` handle that injects `workspace_id` on every read and write → rate
limit → uniform 401/429/500. The 75 hand-rolled routes are correct today by
inspection, which means the next one may not be. **Rule: a new route uses
`withWorkspace`; a touched route is migrated while it's open.** When the last
`getSession(` leaves `app/api`, add a lint rule that forbids importing it
there. The tenant guarantee then stops depending on people.

### 5.2 CSP, with nonces, report-only first

Now that Next 16.3.5 is in, the sequence is: generate a per-request nonce in
the proxy, pass it to the two inline scripts (`public-env`, structured data),
ship `Content-Security-Policy-Report-Only` with `script-src 'self' 'nonce-…'`,
`img-src` limited to self / Supabase / fal / data:, `frame-ancestors 'none'`,
`connect-src` self + Supabase, read the reports for a week, then enforce.
This is the one control that would have neutralised #3 even if a scripted
SVG had shipped.

### 5.3 Untrusted bytes never carry their own label

`lib/uploads/content.ts` is now the only place a stored content type comes
from. Keep it that way: a new upload route imports it or it doesn't merge.
The same rule for SVG — the product can generate them, users can't script
them.

### 5.4 Outbound is a capability, not a call

`fetchPublic` is the only way server code fetches a URL that a user or a
third party chose. `fetch(` on such a value is a review comment. The
remaining raw `fetch` calls are to fixed first-party API hosts (Meta, TikTok,
Reddit, Stripe, fal's queue) and stay raw on purpose — the guard is for
_addresses we don't choose_.

### 5.5 Webhooks: verify, then look up

Every inbound webhook has a signature (Stripe: done; fal: done; the
talking-video callback is our own fal round-trip and inherits fal's). The
pattern is fixed: raw body → verify → log with the verification outcome →
idempotency → process. Adding a provider means adding a verifier, not
deciding whether to.

### 5.6 AI inputs are data, AI outputs are data

Three rules, now followed by the importer and worth holding everywhere a
model runs:

- **Untrusted text goes in delimited, under a system prompt that names it as
  untrusted.** Website content, comments, anything a stranger could have
  written.
- **Every model answer passes a Zod schema before it touches the DB, the UI
  or another API.** Forced tool-use where the SDK allows it (ad-watcher,
  autofix, landing already do); bounded strings and enums everywhere.
- **The model never chooses a URL, a file path, an id, or a credit amount.**
  It proposes copy, layout, colours; code resolves references (the landing
  generator's "no image field" is the model to copy).

The next natural step, when the Funnel's QC gate lands, is the same shape: the
vision model's verdict is a schema'd boolean per check, and _code_ decides
what to do with it.
