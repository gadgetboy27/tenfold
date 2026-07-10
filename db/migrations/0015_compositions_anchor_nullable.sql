-- Layered compositor documents (background + ordered layers) have no single
-- image anchor, so anchor_asset_id must be nullable to persist them via the
-- export-time save. Legacy image compositions still set it.
ALTER TABLE compositions ALTER COLUMN anchor_asset_id DROP NOT NULL;
