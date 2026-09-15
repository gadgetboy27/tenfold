-- 0035_brand_kit_body_font.sql — a brand has two faces, not one.
--
-- `font_family` has always been "the" brand font and is used for headlines.
-- Most websites set a second face for body copy, and an ad that borrows only
-- the heading face reads as almost-but-not-quite the site. The importer
-- (app/api/campaigns/analyze-url) now detects heading and body separately
-- (lib/claude/brand-scrape.ts); this stores the second, plus what the site
-- actually declared so the UI can say "your site uses Poppins — closest we
-- can render is Montserrat" instead of silently substituting.
--
-- body_font_family NULL means "same as font_family" — every existing kit
-- keeps rendering exactly as before.

ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS body_font_family text;
-- { heading: { name, mapped } | null, body: { name, mapped } | null }
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS detected_fonts jsonb;
