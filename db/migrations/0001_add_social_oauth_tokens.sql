-- Add direct OAuth token storage to social_profiles.
-- Replaces the Ayrshare profile-key approach with per-platform token storage.
-- Facebook page access tokens obtained via long-lived user token never expire.

ALTER TABLE "social_profiles"
  ADD COLUMN IF NOT EXISTS "platform_page_id"    text,
  ADD COLUMN IF NOT EXISTS "platform_account_id" text,
  ADD COLUMN IF NOT EXISTS "access_token"        text,
  ADD COLUMN IF NOT EXISTS "refresh_token"       text,
  ADD COLUMN IF NOT EXISTS "token_expires_at"    timestamptz;
