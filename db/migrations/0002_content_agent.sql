-- Content Agent Pipeline Tables

CREATE TABLE IF NOT EXISTS content_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  raw_transcript TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_submissions_workspace ON content_submissions(workspace_id);
CREATE INDEX idx_content_submissions_status ON content_submissions(status);

CREATE TABLE IF NOT EXISTS content_pipeline_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  output_json JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_pipeline_results_submission ON content_pipeline_results(submission_id);
CREATE INDEX idx_content_pipeline_results_stage ON content_pipeline_results(stage);

CREATE TABLE IF NOT EXISTS analytics_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  report_json JSONB NOT NULL,
  week_ending TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE content_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_pipeline_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY content_submissions_workspace_policy ON content_submissions
  USING (workspace_id = auth.uid()::uuid OR EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = content_submissions.workspace_id
    AND workspace_members.user_id = auth.uid()
  ));

CREATE POLICY content_pipeline_results_workspace_policy ON content_pipeline_results
  USING (EXISTS (
    SELECT 1 FROM content_submissions
    WHERE content_submissions.id = content_pipeline_results.submission_id
    AND (content_submissions.workspace_id = auth.uid()::uuid OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = content_submissions.workspace_id
      AND workspace_members.user_id = auth.uid()
    ))
  ));

CREATE POLICY analytics_reports_workspace_policy ON analytics_reports
  USING (workspace_id = auth.uid()::uuid OR EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = analytics_reports.workspace_id
    AND workspace_members.user_id = auth.uid()
  ));
