# SETUP.md — external service setup for tenfold.nz

Practical, click-by-click steps for the third-party integrations that can't be
provisioned from code. Env var names match `.env.example`.

---

## Ayrshare — white-label social linking (JWT / SSO)

This is what powers the hosted **"Connect your socials"** flow for every platform
**except Facebook/Instagram** (those use our own Meta OAuth app and need none of
this). Customers never get an Ayrshare account — they land on a branded linking
page, authorize on their own social provider, and bounce back to Tenfold.

### Plan requirement

JWT/SSO linking is available on **Launch, Business, and Enterprise** tiers.
The **Business Launch Plan** qualifies — no upgrade needed.

### The three moving parts

| Value | Where it comes from | How we use it |
|---|---|---|
| `AYRSHARE_API_KEY` | Dashboard API key | Server-side auth for all Ayrshare calls |
| `profileKey` (per workspace) | Created automatically by our code via `POST /profiles`, stored on the workspace row | Identifies which workspace's socials to link/publish |
| `AYRSHARE_DOMAIN` | **Integration Package** (see below) | Passed to `generateJWT` |
| `AYRSHARE_PRIVATE_KEY` | **Integration Package** `private.key` | Signs the `generateJWT` request |

> **RefId is NOT one of these.** The RefId shown under **User Profiles** is just a
> profile identifier — it is not the `profileKey`, the domain, or the private key.
> Don't try to use it for JWT setup.

### Getting `AYRSHARE_DOMAIN` + `AYRSHARE_PRIVATE_KEY`

The domain and private key live in your **Integration Package**, which is **not**
on the User Profiles screen:

1. In the Ayrshare dashboard, click **"Switch to Primary"** (top-right). The
   Integration Package lives on the **Primary Profile**, not a sub-profile — this
   is the step most people miss.
2. Go to the **API page** (left nav → **API Docs** / API section).
3. Find the Integration Package. It offers **Download** and **Reset**:
   - **Download** → non-destructive; gives you the existing `domain` + `private.key`. **Use this.**
   - **Reset** → generates a *new* key pair and **invalidates the old one**. Only
     use it if the key is lost/leaked, or if Download doesn't reveal the
     `private.key` (some dashboards show it only at creation). Safe to Reset while
     nothing is live yet — **never** Reset once accounts are connected in
     production, it breaks their linking.
4. If neither works, the package was emailed at onboarding, or use the in-dashboard
   chat widget to have Ayrshare resend/regenerate it.

### Filling `.env`

```bash
AYRSHARE_DOMAIN=<the domain from the Integration Package>
# private.key contents on ONE line, real newlines escaped as \n.
# Our helper (lib/ayrshare/profiles.ts) un-escapes \n back to newlines.
AYRSHARE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
```

Until both are set, `generateSocialConnectUrl` throws a "not set up yet" error and
non-Facebook connects fail — Facebook/Instagram keep working regardless.

### How the flow works once configured

1. Customer clicks **Connect** → `GET /api/social/connect` creates (or reuses) the
   workspace's Ayrshare profile and calls `generateJWT`.
2. We redirect them to the returned hosted linking URL (branded to
   `AYRSHARE_DOMAIN`), passing a `redirect` back to `/{slug}/settings/social`.
3. They authorize on their own social provider and are returned to Tenfold, where
   the settings page re-fetches and shows the newly linked accounts.
