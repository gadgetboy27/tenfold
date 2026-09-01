-- Who wired up this workspace's publishing destinations, and when.
--
-- social_profiles answers "what is connected" and overwrites connected_at on
-- every upsert, so a reconnect erases the only timestamp there was. Nothing
-- recorded WHO. For a product where a connected account is permission to post
-- in a business's name, "who attached our Facebook to this, and when did it
-- change?" had no answer at all.
--
-- Deliberately NOT decision_events. That table is explicitly built to make
-- storing anything identifying awkward (see 0028) because it exists to learn
-- workings, and it has no actor column on purpose. This is the opposite kind
-- of record: a security log, where the actor is the entire point.
--
-- Append-only by intent. Rows are never updated and never deleted except by
-- the workspace cascade — a disconnect ADDS a row, it does not remove the
-- connect. An audit trail you can edit is not one.
create table if not exists social_connection_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- The member who did it. NOT a FK: auth.users rows can be deleted, and a
  -- departed employee's actions must survive their account being removed —
  -- that is exactly when the log matters most.
  actor_user_id uuid,
  -- Denormalised so the log stays readable after the account is gone.
  actor_email text,
  platform text not null,
  -- 'connected' | 'reconnected' | 'disconnected' | 'page_switched'
  action text not null,
  -- What we could and couldn't revoke at the provider, the Page id involved,
  -- the failure reason. Never a token: this table is read by humans, and a
  -- credential in a log is a credential in a screenshot.
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_events_workspace
  on social_connection_events (workspace_id, created_at desc);

alter table social_connection_events enable row level security;

-- No policies. Reads go through the service-role client in API routes only,
-- same as decision_events — and a client that could read this table could
-- enumerate a workspace's members by email.
