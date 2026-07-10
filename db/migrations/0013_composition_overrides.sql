-- Per-format layout overrides for the layered compositor.
-- Shape: { "<aspect>": { "<layerId>": { pos?, scale?, sizePx?, rotationDeg? } } }
-- (deltas only; absent aspects/layers inherit the master). See
-- CompositionOverrides in lib/composition/layers.ts.
ALTER TABLE compositions
  ADD COLUMN IF NOT EXISTS overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
