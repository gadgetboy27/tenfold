# Auth Providers — Setup

tenfold supports email/password, magic links, and OAuth via **Google**, **Facebook**,
and **LinkedIn**. The app code is fully wired (`lib/auth/oauth-client.ts`,
`lib/auth/oauth-callback.ts`); the steps below are the Supabase + provider
**dashboard config** required to make each one work.

## 1. Supabase URL configuration (do this once)

**Supabase Dashboard → Authentication → URL Configuration:**

- **Site URL:** your production origin, e.g. `https://tenfold.nz`
- **Redirect URLs** (allowlist — add every origin you sign in from):
  ```
  https://tenfold.nz/auth/callback
  https://tenfold.nz/callback
  https://tenfold-production-78db.up.railway.app/auth/callback
  http://localhost:3000/auth/callback
  ```

The app sends users to `${NEXT_PUBLIC_APP_URL}/auth/callback`. Both `/auth/callback`
(primary) and `/callback` (alias) are handled, so either works — but the URL must
be in the allowlist above or Supabase rejects the redirect.

> On Railway, set `NEXT_PUBLIC_APP_URL` to the exact origin you're testing from.
> If it's `https://tenfold.nz` but you open the `*.up.railway.app` URL, OAuth will
> redirect to tenfold.nz. (When unset, the client falls back to the current origin.)

## 2. Providers (Supabase → Authentication → Providers)

For each provider you create an app in that provider's developer console, then paste
its **Client ID** and **Client Secret** into Supabase. The single most important
value: the provider's own **Authorized redirect URI is always Supabase's callback**,
NOT the app's `/auth/callback`. For this project it is:

```
https://gbccfqpmoteicpumhkuj.supabase.co/auth/v1/callback
```

Same pattern for every provider: **create app → copy Client ID + Secret → enable the
provider in Supabase and paste them → add the Supabase callback above as the app's
redirect URI.**

### Google
1. **console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client ID**
   (Web application). This project's client ID ends with
   `…88qear6rtb32rsqm1pbv2a6494tqaii2`.
2. **Authorized redirect URIs → Add URI:** paste the Supabase callback above. Save.
   (Optionally add `https://gbccfqpmoteicpumhkuj.supabase.co` to Authorized
   JavaScript origins.)
3. **OAuth consent screen:** set Publishing status to **In production** (External).
   While in **Testing**, only emails listed under *Audience → Test users* can sign
   in — everyone else gets "Access blocked".
4. **Supabase → Providers → Google** → enable → paste Client ID + Secret → Save.

> **"OAuth user cap" (0 / 100) does NOT apply here.** The cap only limits unverified
> apps that request *sensitive/restricted* scopes (Gmail, Drive, …). This app only
> requests `openid email profile` (non-sensitive), so there's no cap and no
> verification needed.
>
> **`Error 400: redirect_uri_mismatch`** means the Supabase callback above isn't in
> the OAuth client's Authorized redirect URIs — check for a trailing slash, `http`
> vs `https`, the wrong OAuth client, or the wrong Google project.

### Facebook
1. **developers.facebook.com → My Apps → Create App** → use case
   **"Authenticate and request data from users with Facebook Login."**
2. Add the **Facebook Login** product.
3. **Facebook Login → Settings → Valid OAuth Redirect URIs:** paste the Supabase
   callback above. Save.
4. **App Settings → Basic:** copy **App ID** (= Client ID) and **App Secret**. Add a
   Privacy Policy URL (required to go Live).
5. Flip the app from **Development → Live** (top toggle) — otherwise only listed
   testers can sign in.
6. **Supabase → Providers → Facebook** → enable → paste App ID + App Secret → Save.

### LinkedIn  (provider key: `linkedin_oidc`)
1. **linkedin.com/developers → Create app** — you must attach a LinkedIn **Company
   Page** (create a basic one if needed).
2. **Products** tab → request **"Sign In with LinkedIn using OpenID Connect"**
   (usually granted instantly). ⚠️ NOT the legacy "Sign In with LinkedIn" v1 — it's
   deprecated and won't work with `linkedin_oidc`.
3. **Auth** tab → **Authorized redirect URLs:** add the Supabase callback above.
4. **Auth** tab → copy **Client ID** and **Primary Client Secret**.
5. **Supabase → Providers → LinkedIn (OIDC)** → enable → paste Client ID + Secret →
   Save. Scopes `openid profile email` are granted by default.

## 3. Verify

- `/login` and `/signup` show Google, Facebook, and LinkedIn buttons plus
  email/password and magic-link tabs.
- Clicking a provider → provider consent → returns to `/auth/callback` →
  first login provisions a workspace (50 welcome credits) → lands on `/{slug}`.
- Magic link / email-confirm links also land on `/auth/callback`.

**Quick non-browser check that a provider is wired** (catches typos before clicking
buttons) — follow the Supabase→provider authorize redirect and confirm the provider
serves a sign-in page instead of an error:

```bash
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2-)
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2-)
# provider = google | facebook | linkedin_oidc
curl -s -i "$URL/auth/v1/authorize?provider=google&redirect_to=https://tenfold-production-78db.up.railway.app/auth/callback" \
  -H "apikey: $ANON" | grep -i '^location:'
# Open that Location URL: a sign-in page = wired; "redirect_uri_mismatch" = the
# Supabase callback is missing from that provider app's redirect URIs.
```

If a provider button returns **"provider is not enabled"**, it isn't toggled on in
Supabase yet. If it returns **"redirect_uri mismatch"**, the Supabase callback is
missing from the provider app's Authorized redirect URIs (section 2).

## Status (last verified 2026-06-11)

- **Email/password + magic link:** working. Signup auto-confirms and signs in (see
  `AUTH_AUTOCONFIRM_SIGNUP` in `.env.example`; set to `false` to require email
  verification).
- **Google:** enabled and verified — Supabase callback accepted, consent screen In
  production.
- **Facebook / LinkedIn:** code wired; pending provider-app creation + Supabase
  enable per section 2.
