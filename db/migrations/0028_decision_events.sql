-- Decision events — how people work, not what they make.
--
-- The goal is to learn the WORKINGS: how many options someone looks at before
-- committing, whether they refine or restart, which steps they skip, where
-- they stop. That's what would eventually let the product suggest a next step
-- or pick a sensible default — and none of it requires knowing what anyone's
-- campaign is about.
--
-- So this table is deliberately built to make storing customer content awkward:
-- `payload` holds counts, durations, enum-ish labels and booleans. Never prompt
-- text, captions, asset URLs, business names or anything a user authored.
-- lib/learning/record.ts enforces that on the write side; this comment is the
-- reason, so nobody "just adds the prompt" later for convenience.
--
-- Workspace-scoped like every other tenant table, so a workspace deletion takes
-- its behavioural history with it.

create table if not exists decision_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- What happened, e.g. 'anchor_picked', 'images_regenerated', 'section_opened'.
  event text not null,
  -- Structural facts only. See the note above.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_decision_events_workspace
  on decision_events (workspace_id, created_at desc);
create index if not exists idx_decision_events_event
  on decision_events (event, created_at desc);

alter table decision_events enable row level security;

-- No policies: reads go through the service-role client only. Consistent with
-- the rest of the schema, and it means no client can read another workspace's
-- behaviour even if the anon key leaked.
