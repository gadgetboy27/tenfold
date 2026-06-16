-- 0009_promo_codes.sql — Promo / friends-and-family redeem codes.
-- A code grants a fixed number of credits to a workspace, once per workspace.
-- redeem_promo_code() does the whole thing atomically (validate → grant ledger
-- row → bump cached_balance → record redemption), mirroring debit_credits().
-- Both tables are RLS-on with NO policies: only the service-role admin client
-- (used by the /api/credits/redeem route) reads/writes them, so codes and their
-- values are never exposed to the browser.

create table if not exists promo_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  credits          integer not null check (credits > 0),
  active           boolean not null default false,
  max_redemptions  integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0,
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists promo_redemptions (
  id              uuid primary key default gen_random_uuid(),
  promo_code_id   uuid not null references promo_codes(id) on delete cascade,
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  credits_granted integer not null,
  redeemed_at     timestamptz not null default now(),
  unique (promo_code_id, workspace_id)
);

alter table promo_codes enable row level security;
alter table promo_redemptions enable row level security;
-- No policies on purpose: anon/authenticated get nothing; the service role
-- (admin client) bypasses RLS and is the only caller.

create or replace function redeem_promo_code(p_workspace_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    promo_codes%rowtype;
  v_balance integer;
begin
  -- Lock the code row so concurrent redemptions serialise on it.
  select * into v_code from promo_codes
   where upper(code) = upper(btrim(p_code))
   for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'invalid');
  end if;
  if not v_code.active then
    return jsonb_build_object('success', false, 'reason', 'inactive');
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('success', false, 'reason', 'expired');
  end if;
  if v_code.max_redemptions is not null and v_code.redemption_count >= v_code.max_redemptions then
    return jsonb_build_object('success', false, 'reason', 'exhausted');
  end if;

  -- One redemption per workspace.
  if exists (
    select 1 from promo_redemptions
     where promo_code_id = v_code.id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('success', false, 'reason', 'already_redeemed');
  end if;

  -- Ensure (and lock) the workspace's credit account.
  select cached_balance into v_balance from credit_accounts
   where workspace_id = p_workspace_id for update;
  if not found then
    insert into credit_accounts (workspace_id, cached_balance) values (p_workspace_id, 0);
    v_balance := 0;
  end if;

  v_balance := v_balance + v_code.credits;

  insert into credit_transactions (workspace_id, type, amount, balance_after, description)
  values (p_workspace_id, 'grant', v_code.credits, v_balance, 'Promo code: ' || v_code.code);

  update credit_accounts set cached_balance = v_balance, updated_at = now()
   where workspace_id = p_workspace_id;

  insert into promo_redemptions (promo_code_id, workspace_id, credits_granted)
  values (v_code.id, p_workspace_id, v_code.credits);

  update promo_codes set redemption_count = redemption_count + 1 where id = v_code.id;

  return jsonb_build_object('success', true, 'balance', v_balance, 'credits', v_code.credits);
end;
$$;

-- Only the service role may execute it (not anon/authenticated via PostgREST).
revoke all on function redeem_promo_code(uuid, text) from public, anon, authenticated;
grant execute on function redeem_promo_code(uuid, text) to service_role;

-- Seed the friends & family code — INACTIVE until you flip active = true.
insert into promo_codes (code, credits, active, max_redemptions)
values ('FRIENDS2026', 300, false, 50)
on conflict (code) do nothing;
