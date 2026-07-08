-- 0012_brand_kit_dark_logo.sql — brand kit logo variants (compositor Prompt 3).
-- logo_url stays the primary (light) mark, used on dark footage; the dark
-- variant is for light backgrounds. Both are transparent PNG/SVG in storage.

ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS logo_dark_url text;
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS logo_dark_storage_path text;
