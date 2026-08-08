-- campaign_runs — the foreman's memory.
--
-- One prompt should produce a finished campaign without seven button presses.
-- The generators all exist; what was missing is something that holds the plan,
-- knows which step is in flight, and survives the browser being closed.
--
-- Durable on purpose. fal jobs are async and webhook-driven, so a run can span
-- minutes; keeping the chain in React state would mean a refresh silently
-- abandons a campaign the user has already paid ~83 credits for.
--
-- `stages` is the plan AND the log: an ordered array of
--   { stage, status, jobId?, startedAt?, endedAt?, error?, skipped? }
-- so a partially-failed run can be read without joining creative_jobs.
--
-- Deliberately stops BEFORE publishing. The FAQ promises "nothing goes out on
-- its own", and that promise is worth more than the last click. The foreman
-- assembles everything and hands over.

create table if not exists campaign_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  -- queued | running | awaiting_publish | failed | cancelled
  status text not null default 'queued',
  -- Which entry of `stages` is in flight. Null once settled.
  current_stage text,
  stages jsonb not null default '[]'::jsonb,
  -- What we quoted the user vs what actually got debited. Divergence is the
  -- signal that a stage failed and refunded, or that costs moved under us.
  credits_estimated integer not null default 0,
  credits_spent integer not null default 0,
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaign_runs_workspace
  on campaign_runs (workspace_id, created_at desc);
-- The webhook looks a run up by campaign to advance it; keep that cheap.
create index if not exists idx_campaign_runs_campaign
  on campaign_runs (campaign_id) where status in ('queued', 'running');

alter table campaign_runs enable row level security;
-- No policies: service-role access only, consistent with the rest of the schema.
