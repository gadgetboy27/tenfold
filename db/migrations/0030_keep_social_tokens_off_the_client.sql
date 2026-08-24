-- Keep OAuth tokens out of the browser.
--
-- social_profiles_select_member lets any workspace member SELECT their
-- workspace's rows, and anon/authenticated held a TABLE-level SELECT — so a
-- signed-in browser fetching ?select=platform,access_token got the token back
-- in plaintext. Verified against this database before writing: `authenticated`
-- held SELECT on access_token AND refresh_token.
--
-- That matters more than "it's their own account" suggests. Meta Page tokens
-- never expire, so one XSS or one stolen session escalates from "read their
-- tenfold data" to permanent control of their Facebook Page. Refresh tokens
-- are worse — they mint fresh access to LinkedIn, TikTok and Reddit
-- indefinitely, long after the session is gone.
--
-- THE TRAP, and why this is written the long way round:
--   REVOKE SELECT (access_token) ... against a table-wide GRANT is silently a
--   NO-OP. Postgres checks the table-level grant first and never consults the
--   column list, so the migration reports success and the token still comes
--   back. The table grant must be revoked OUTRIGHT, then the safe columns
--   granted back by name.
--
-- Safe because nothing in the client reads this table: all 17 call sites are
-- API routes using the service role, which these grants do not affect.
-- Ported from fix/ayrshare-publish-contract (0407c7f), renumbered onto
-- master's migration sequence.

-- 1. Remove the blanket table grants.
REVOKE SELECT ON public.social_profiles FROM anon;
REVOKE SELECT ON public.social_profiles FROM authenticated;

-- 2. Grant back only what a client legitimately needs to answer
--    "which platforms are connected, and under what name?".
--    access_token, refresh_token and metadata are deliberately absent —
--    metadata holds facebook_pages[].access_token, a live token for EVERY
--    page the user manages.
GRANT SELECT (
  id,
  workspace_id,
  platform,
  handle,
  profile_display_name,
  platform_account_id,
  platform_page_id,
  connected_at,
  token_expires_at
) ON public.social_profiles TO authenticated;

-- anon gets nothing: an unauthenticated caller has no business reading which
-- accounts a workspace has connected.
