# Campaign landing pages — scope

**Status: proposed, not built.** Written 2026-09-09. Nothing below exists yet.

## What this is, and what it deliberately isn't

**A page the ad points at**, generated from the campaign that already exists —
its anchor image, its brand kit, its funnel copy — with a lead form.

**Not a website builder.** First Page's delivered landing page
(`housematch.enquiretoday.co.nz`) turned out to be a Lovable app with a
Shutterstock hero on their own domain. If the job is commoditised enough that
an agency reaches for an AI builder, competing with Lovable, Framer and Carrd
is a fight with none of our advantages.

The version worth building is the one Lovable structurally cannot do, because
it does not know about the campaign: the page uses **the creative you just
made**, in **your brand**, saying **what the ads say**. That is a feature OF
the ad, not a product beside it.

Scope discipline: if a request would make sense for someone who has no
campaign, it belongs in a website builder and not here.

---

## 1. Serving — the decision that avoids a month of infrastructure

**A dynamic route on the app we already run: `prettymuch.nz/p/<slug>`.**

Not a static bucket, not a per-workspace subdomain, not custom domains. Those
mean DNS, TLS issuance, verification and renewal — infrastructure, not a
feature, and the reason "landing pages" reads as L effort everywhere else.

`app/guides/[slug]` is the precedent: a public, indexable, server-rendered
route already lives in this app. `robots.ts` disallows only `/api/`, `/login`,
`/signup`, `/auth/`, so `/p/*` is indexable by default, which is what a landing
page wants.

**One collision, smaller than it first looks.** `/[workspace]` is a root path
segment, so a static `/p` shadows any workspace slugged `p`. But this hazard
already exists and is already survived: `about`, `guides`, `pricing`,
`privacy`, `terms`, `login`, `content`, `auth` and `api` are all static
segments today.

`buildSlug` always appends six characters of the workspace uuid
(`henry-p-16af1d`), so an auto-provisioned slug can never be a bare reserved
word. The exposure is only seeded or hand-written slugs — and those exist:
`iamgadgetboy` and `henrypeti` both have no suffix.

So this is worth a reserved-word check on any path that accepts an explicit
slug, not a blocker. Adding `p` extends a list that is already unenforced;
the honest fix is to enforce the whole list once, not to special-case this
feature.

**Custom domains are explicitly v2**, and should stay out until someone asks
twice. The honest v1 line: "your page lives at prettymuch.nz/p/your-campaign".

---

## 2. Data model

### `landing_pages`

| column | notes |
|---|---|
| `id` | uuid pk |
| `workspace_id` | uuid, RLS + every query filters on it |
| `campaign_id` | uuid — the page belongs to a campaign; that IS the scoping |
| `slug` | citext unique, `[a-z0-9-]{3,60}`, reserved words rejected |
| `title`, `description` | `<title>` and meta description |
| `blocks` | jsonb — the separable parts, below |
| `theme` | jsonb — snapshot of the brand kit AT PUBLISH TIME |
| `published_at` | null = draft. A draft 404s publicly |
| `created_at`, `updated_at` | |

**`theme` is a snapshot, not a live read.** Editing the brand kit six months
later must not silently restyle a live page someone is running ads to. Same
reasoning as `campaigns.publish_asset_id`: the thing that shipped is a fact,
not a query.

### `page_leads`

| column | notes |
|---|---|
| `id`, `page_id`, `workspace_id` | |
| `fields` | jsonb — whatever the form block declared |
| `created_at` | |
| `source` | utm/referrer, so "which ad worked" is answerable |

---

## 3. Blocks — the separable parts

A discriminated union, Zod-validated, **exactly like `layerSchema`** — same
pattern, same discipline, so the two models read alike and a new block is a
compile error until it is handled everywhere.

```
hero        headline, sub, image (campaign asset), CTA
features    3–5 items: icon/emoji, title, body   ← the MOF carousel, as a page
gallery     N campaign images
text        heading + rich-ish paragraph
cta         headline + button (anchor to the form, or an external URL)
form        declared fields + submit label + post-submit message
footer      brand mark, business name, links
```

Every block carries `id`, `order`, and an optional per-block colour override
that defaults to `theme`.

**Why blocks and not a page builder canvas:** a landing page is a vertical
stack, not a free canvas. Absolute positioning on a page that must work at
375px and 1440px is the thing that makes hand-built pages break. Blocks are
responsive by construction.

---

## 4. Editing — in Compose, as you asked

Compose gets a **Page** tab beside the ad.

- The block list is a **reorderable column**, same interaction language as
  `LayerList`: select, reorder, delete, undo. `useAdShortcuts` already gives
  Del and ⌘Z; the page store should mirror `useCompositorStore`'s
  `editDoc`-with-history shape so undo works identically rather than
  differently.
- **The element tray already works.** It carries this project's images, brand
  marks and gallery — drag one onto a hero or gallery block. That is the same
  gesture that already puts an image on the ad, which is the point of putting
  this in Compose rather than a new section.
- **Live preview** at a phone/desktop toggle, beside the ad canvas.
- **Generate** fills every block at once from the campaign brief and funnel
  copy — the first draft is never a blank page.

Menu impact: **none.** It is a tab inside Compose, not a twelfth nav item.

---

## 5. Lead capture — the half that is not HTML

- `POST /api/pages/[slug]/lead` — public, unauthenticated by necessity.
- **Rate limited** via the existing `lib/security/rate-limit.ts` (the
  `withWorkspace` limiter is not usable here — no session — so this needs the
  primitive directly, keyed on IP + slug).
- **Honeypot field** plus a minimum time-to-submit. No third-party captcha in
  v1; it is a lead form on a small page, not a login.
- Leads land in `page_leads`, visible in Compose's Page tab, **exportable as
  CSV** — the same "take it with you" principle as the campaign pack.
- **Email notification** on new lead via the existing Resend integration.
  A lead nobody sees is worse than no form.

---

## 6. Credits

| action | cost |
|---|---|
| Generate/regenerate page copy | `script_generation` tier (Claude only) |
| Publish, edit, serve, capture leads | **free** |

Serving is free because it runs on infrastructure we already pay for, and
charging rent on a page that exists to make the ads work would tax the thing
we want people doing.

---

## 7. Build order

1. Schema + Zod block union + `/p/[slug]` renderer with a hardcoded doc — proves
   serving before anything can be edited.
2. Enforce reserved workspace slugs — the whole existing list (`about`,
   `guides`, `pricing`, `terms`, `login`, `api`, `auth`, `content`) plus `p`.
   Auto-generated slugs are already safe; this closes hand-written ones.
3. Page tab in Compose: block list, reorder, delete, undo, tray drops.
4. Claude generation from the campaign brief.
5. Form block + lead route + rate limit + honeypot.
6. Leads view + CSV + email notification.

Steps 1–2 are the risky ones and they are first on purpose.

---

## 8. Explicitly out of scope for v1

Custom domains · multi-page sites · a CMS · A/B testing · analytics beyond
`source` on the lead · anything that would be useful to someone with no
campaign.

---

## 9. The honest risks

- **This is the first feature that drags infrastructure behind it.** Serving is
  cheap on our own route; the moment someone asks for `www.theirbrand.co.nz` it
  is not. Say no in v1 and mean it.
- **A public write endpoint is new surface for us.** Everything else in this
  app is behind a session. Rate limit and honeypot are not polish here.
- **Scope creep is the actual risk, not difficulty.** "Can it have a blog" is
  one question away from every request in §8, and each sounds small.
