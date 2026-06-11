-- 0008_brand_voice.sql — Brand Voice profile per workspace.
-- Stored on brand_kits (same table as the visual brand kit). voice_profile is
-- the AI-extracted style guide injected into the caption/script generator;
-- voice_samples keeps the source posts so the user can edit and re-analyse.

ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS voice_profile text;
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS voice_samples jsonb NOT NULL DEFAULT '[]'::jsonb;
