-- The metadata blob carries tokens too, and 0018 missed it.
--
-- social_profiles.metadata holds { facebook_pages: [{ id, name, access_token }] }
-- — a live Page token for EVERY page the user manages. 0018 revoked the
-- access_token column and then granted metadata straight back, so the same
-- secret stayed one `?select=metadata` away. Closing the front door and leaving
-- the window open.
--
-- Nothing legitimate reads it from the browser: no client code queries
-- social_profiles at all, and app/api/social/profiles/route.ts already projects
-- the page list down to { id, name } explicitly before it returns — a real map,
-- not just a type annotation claiming it.
REVOKE SELECT (metadata) ON public.social_profiles FROM authenticated;

COMMENT ON COLUMN public.social_profiles.metadata IS
  'Server-only. Contains facebook_pages[].access_token — never grant to anon/authenticated.';
