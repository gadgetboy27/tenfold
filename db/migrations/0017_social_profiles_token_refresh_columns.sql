-- Reconcile social_profiles with db/schema.ts, which has declared these two
-- columns since it was written while the live table never had them. Nothing
-- noticed because Facebook is the only connected platform and Meta Page tokens
-- never expire — so no code had ever read them. The token-refresh layer does,
-- and would have failed at runtime the moment LinkedIn or Reddit connected.
ALTER TABLE social_profiles
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

COMMENT ON COLUMN social_profiles.refresh_token IS
  'OAuth refresh token. Null for Meta Page tokens, which do not expire.';
COMMENT ON COLUMN social_profiles.token_expires_at IS
  'When access_token dies. Null = never (Meta Pages). LinkedIn ~60d, TikTok 24h, Reddit 1h.';

CREATE INDEX IF NOT EXISTS idx_social_profiles_token_expires_at
  ON social_profiles (token_expires_at)
  WHERE token_expires_at IS NOT NULL;
