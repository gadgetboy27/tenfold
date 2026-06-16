-- 0010_atomic_grant_credits.sql — Atomic, idempotent credit grant.
-- Replaces the non-atomic read-modify-write in lib/stripe/webhooks.ts (which read
-- cached_balance, then separately inserted a ledger row and UPDATEd the balance —
-- a lost-update race, and a direct balance write forbidden by CLAUDE.md §2).
--
-- Mirrors debit_credits()/refund_credits(): lock the account row FOR UPDATE so
-- concurrent grants for the same workspace serialise, then a check-before-insert
-- on the Stripe payment/invoice id makes the grant idempotent (Stripe replays and
-- overlapping event types can't double-credit). p_idempotency_key is the Stripe
-- payment_intent id (pack purchase) or invoice id (subscription renewal); NULL for
-- ad-hoc grants that need no dedup.

CREATE OR REPLACE FUNCTION grant_credits(
  p_workspace_id    uuid,
  p_amount          int,
  p_description     text,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_amount', 'balance', 0);
  END IF;

  -- Lock (and ensure) the account row first so the dedup check below is reliable
  -- under concurrency — all grants for this workspace serialise here.
  SELECT cached_balance INTO v_balance
  FROM credit_accounts
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO credit_accounts (workspace_id, cached_balance)
    VALUES (p_workspace_id, 0);
    v_balance := 0;
  END IF;

  -- Idempotent: if we've already granted for this payment/invoice, no-op.
  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE stripe_payment_intent_id = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('success', true, 'balance', v_balance, 'duplicate', true);
  END IF;

  v_balance := v_balance + p_amount;

  INSERT INTO credit_transactions
    (workspace_id, type, amount, balance_after, description, stripe_payment_intent_id)
  VALUES
    (p_workspace_id, 'purchase', p_amount, v_balance, p_description, p_idempotency_key);

  UPDATE credit_accounts
  SET cached_balance = v_balance, updated_at = now()
  WHERE workspace_id = p_workspace_id;

  RETURN jsonb_build_object('success', true, 'balance', v_balance, 'duplicate', false);
END;
$$;

-- Service role only (not anon/authenticated via PostgREST) — mirrors the other
-- credit RPCs; only the admin client in the Stripe webhook calls this.
REVOKE ALL ON FUNCTION grant_credits(uuid, int, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_credits(uuid, int, text, text) TO service_role;
