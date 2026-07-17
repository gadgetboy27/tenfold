-- One row per (publish, platform) attempt — the observability that has been
-- missing all along.
--
-- Publishes have failed silently through this whole codebase: Ayrshare
-- reported failures as successes, unchecked inserts dropped jobs, Instagram
-- could never connect. publish_records stores the final platform_results blob,
-- but nothing records WHICH backend handled each platform or WHY one failed, so
-- there was no way to answer "did that actually post, and if not, where did it
-- break". This is that record.
--
-- Server-only. No RLS policy is added, and the table is not granted to
-- anon/authenticated, so it is deny-all to the client (same fail-closed shape
-- as webhook_logs). Diagnostics belong to us, not the browser.
CREATE TABLE IF NOT EXISTS publish_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  publish_record_id uuid REFERENCES publish_records(id) ON DELETE SET NULL,
  platform      text NOT NULL,
  backend       text NOT NULL,
  ok            boolean NOT NULL,
  post_id       text,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publish_attempts_workspace
  ON publish_attempts (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publish_attempts_failures
  ON publish_attempts (workspace_id, created_at DESC)
  WHERE ok = false;

ALTER TABLE publish_attempts ENABLE ROW LEVEL SECURITY;
