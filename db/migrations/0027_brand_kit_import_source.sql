-- 0027_brand_kit_import_source.sql — "Brand Brain" (PRODUCT_STRATEGY.md
-- §3/§4.6): track where a brand kit's colors/font came from when imported
-- from a website (app/api/campaigns/analyze-url/route.ts), so the UI can
-- show "imported from example.com" and so the route knows whether an
-- existing kit was ever customized before deciding to overwrite it.

ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS imported_at timestamptz;
