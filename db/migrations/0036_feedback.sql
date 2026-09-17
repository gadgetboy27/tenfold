-- 0036_feedback.sql — feedback is a queue to work through, not an email.
--
-- POST /api/feedback has only ever forwarded a message to admin@ via Resend.
-- Mail is a fine notification and a poor backlog: nothing records that a
-- report was seen or dealt with, a Resend hiccup loses it outright, and the
-- one place it could be listed is an inbox. This keeps every report as a row
-- with a status, and the context the widget captures (page, Studio section,
-- campaign, browser) so a bug can be reproduced without a reply asking where
-- it happened. GET /api/ops/feedback lists them; PATCH moves the status.

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug', 'idea', 'question', 'other')),
  message text NOT NULL,
  reply_to text,
  -- { page, section, campaignId, userAgent, viewport, tz, appVersion }
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'seen', 'done')),
  -- A one-liner from whoever triaged it, so "done" carries what was done.
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status
  ON feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_workspace
  ON feedback (workspace_id, created_at DESC);

-- RLS as the second layer (root CLAUDE.md §2.4). Writes go through the
-- service-role client in the route; members may read their own workspace's.
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_workspace_member ON feedback;
CREATE POLICY feedback_workspace_member ON feedback
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
