-- Keep OAuth tokens out of the browser.
--
-- social_profiles_select_member lets any workspace member SELECT their
-- workspace's rows, and anon/authenticated held a TABLE-level SELECT — so a
-- logged-in browser could read access_token straight out of PostgREST.
-- Verified before this migration: a signed-in member fetching
-- ?select=platform,access_token got the token back in plaintext.
--
-- Why it matters more than "it's their own account": Meta Page tokens never
-- expire, so one XSS or one stolen session escalates from "read their tenfold
-- data" to permanent control of their Facebook Page. refresh_token is worse —
-- it mints fresh access to LinkedIn, TikTok and Reddit indefinitely, long
-- after the session is gone.
--
-- A column-level REVOKE does NOT work here: Postgres checks the table-level
-- grant first, so `REVOKE SELECT (access_token)` against a table-wide GRANT is
-- silently a no-op. (Confirmed the hard way — the revoke "succeeded" and the
-- token still came back.) The table grant has to go, then the safe columns get
-- granted back explicitly.
--
-- Nothing legitimate loses access: app/api/social/profiles/route.ts already
-- names an explicit column list without the tokens, and every server-side
-- reader uses the service role, which bypasses grants entirely.

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.social_profiles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.social_profiles FROM authenticated;

-- Members may still see WHICH platforms are connected — just not the secrets.
GRANT SELECT (
  id, workspace_id, platform, handle, profile_display_name,
  platform_page_id, platform_account_id, metadata, connected_at,
  token_expires_at
) ON public.social_profiles TO authenticated;

-- Writes stay server-only. Every one of them (OAuth callback, token refresh,
-- Page switch) runs as the service role; the browser has no business here.
