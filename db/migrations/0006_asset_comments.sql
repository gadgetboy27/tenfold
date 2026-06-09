-- 0006_asset_comments.sql — per-asset comment threads (user notes + AI suggestions)
-- Raw SQL migration (mixed-migration convention, see db/migrations/README.md).
-- Schema source of truth mirrored in db/schema.ts (assetComments).

CREATE TABLE IF NOT EXISTS asset_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id   uuid NOT NULL REFERENCES campaigns(id)  ON DELETE CASCADE,
  asset_id      uuid NOT NULL REFERENCES assets(id)     ON DELETE CASCADE,
  author_id     uuid,                                       -- null for AI suggestions
  kind          text NOT NULL DEFAULT 'user' CHECK (kind IN ('user', 'ai_suggestion')),
  body          text NOT NULL,
  anchor        jsonb NOT NULL DEFAULT '{}'::jsonb,          -- {x,y} image pin or {t} video timestamp
  job_id        uuid,                                        -- creative_jobs row when kind = 'ai_suggestion'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_comments_asset     ON asset_comments(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_comments_workspace ON asset_comments(workspace_id);

-- RLS second layer (app already scopes via withWorkspace). Members of the
-- workspace may read/write its comments.
ALTER TABLE asset_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_comments_workspace_isolation ON asset_comments;
CREATE POLICY asset_comments_workspace_isolation ON asset_comments
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
