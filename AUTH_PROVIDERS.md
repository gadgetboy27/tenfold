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
its **Client ID** and **Client Secret** into Supabase. The provider's own
"Authorized redirect URI" is always Supabase's callback, **not** the app's:

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

### Google
1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Paste Client ID + Secret into Supabase → Providers → **Google** → enable.

### Facebook
1. developers.facebook.com → create an app → add **Facebook Login**.
2. Valid OAuth Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Paste App ID + App Secret into Supabase → Providers → **Facebook** → enable.

### LinkedIn  (provider key: `linkedin_oidc`)
1. linkedin.com/developers → create an app (link a Company Page).
2. **Products** tab → request **“Sign In with LinkedIn using OpenID Connect”**
   (this is the OIDC product — the legacy “Sign In with LinkedIn” v1 is deprecated
   and is NOT what `linkedin_oidc` uses).
3. **Auth** tab → Authorized redirect URLs:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Copy the Client ID + Client Secret into Supabase → Providers →
   **LinkedIn (OIDC)** → enable. Scopes `openid profile email` are default.

## 3. Verify

- `/login` and `/signup` show Google, Facebook, and LinkedIn buttons plus
  email/password and magic-link tabs.
- Clicking a provider → provider consent → returns to `/auth/callback` →
  first login provisions a workspace (50 welcome credits) → lands on `/{slug}`.
- Magic link / email-confirm links also land on `/auth/callback`.

If a provider button returns "provider is not enabled", it isn't toggled on in
Supabase yet. If it returns "redirect_uri mismatch", the app origin is missing
from the **Redirect URLs** allowlist in step 1.
