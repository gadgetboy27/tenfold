-- Logo Studio projects — the state machine for a logo build (brief → concepts →
-- anchor → refine → finalize → package). Workspace-scoped, RLS-denied to the
-- client (server routes use the service role). Additive and dormant until the
-- FEATURE_LOGO_BUILDER flag ships.
--
-- gen_random_uuid(), matching every other migration in this repo. Logo ASSETS
-- live in the existing assets table (type 'image', metadata.kind 'logo_svg');
-- only the project's own state lives here.
CREATE TABLE IF NOT EXISTS logo_projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL,
  brief           jsonb NOT NULL DEFAULT '{}'::jsonb,
  anchor_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  final_asset_id  uuid REFERENCES assets(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'briefing'
                    CHECK (status IN ('briefing','generating','selecting',
                                      'refining','finalized','packaged')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logo_projects_workspace
  ON logo_projects (workspace_id, created_at DESC);

ALTER TABLE logo_projects ENABLE ROW LEVEL SECURITY;
