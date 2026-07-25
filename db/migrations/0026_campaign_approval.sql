-- 0026_campaign_approval.sql — Approval state machine (PRODUCT_STRATEGY.md §4).
--
-- Lives on `campaigns`, not `compositions`: every publish path resolves a
-- campaign_id (video publishes pass it directly; image/composition publishes
-- can look it up via assets.campaign_id / compositions.campaign_id), while a
-- composition-level gate would miss Studio's simple image/video publishes,
-- which usually never touch the compositions table at all. `campaigns.status`
-- already means something else (the image-generation lifecycle —
-- generating/ready/failed), so this is a new column, not a repurposed one.
--
-- Deliberately three states, not the five the original ask sketched
-- (draft/pending_review/approved/scheduled/published): "scheduled" and
-- "published" already exist with more granularity on publish_records.status
-- (per platform, per post — a campaign can be scheduled on some platforms and
-- published on others). Duplicating that here would just drift out of sync
-- with it. This column only answers the one question upstream of publishing:
-- has a reviewer signed off.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE campaigns
  DROP CONSTRAINT IF EXISTS campaigns_approval_status_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_approval_status_check
  CHECK (approval_status IN ('draft', 'pending_review', 'approved'));

CREATE INDEX IF NOT EXISTS idx_campaigns_approval_status
  ON campaigns (approval_status);
