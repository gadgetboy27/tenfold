-- 0011_compositor_layers.sql — layered compositor (docs/tenfold-compositor-brief.md).
-- Extends compositions with the serialisable layer document. `background` is the
-- footage under the layers ({kind:'video'|'image', src, durationSec?}); `layers`
-- is the ordered Layer[] (index 0 = back). The legacy text_overlays/branding
-- columns stay for existing rows; new compositor writes go to these columns.

ALTER TABLE compositions ADD COLUMN IF NOT EXISTS background jsonb;
ALTER TABLE compositions ADD COLUMN IF NOT EXISTS layers jsonb NOT NULL DEFAULT '[]'::jsonb;
