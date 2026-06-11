-- Atomic credit refund function (prevents duplicate refunds on webhook retries).
-- Idempotency is enforced by a check-before-insert under the job-row lock
-- (FOR UPDATE), which serialises concurrent refunds for the same job — no
-- partial UNIQUE constraint required (Postgres rejects `UNIQUE (...) WHERE ...`).

CREATE OR REPLACE FUNCTION refund_credits(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_workspace_id    uuid;
  v_credits_charged int;
  v_job_type        text;
  v_new_balance     int;
BEGIN
  -- Lock the job row to serialise concurrent refund attempts.
  SELECT workspace_id, credits_charged, type
    INTO v_workspace_id, v_credits_charged, v_job_type
  FROM creative_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_credits_charged, 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No credits to refund');
  END IF;

  -- Idempotent: skip if this job was already refunded.
  IF EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE job_id = p_job_id AND type = 'refund'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Already refunded');
  END IF;

  SELECT cached_balance INTO v_new_balance
  FROM credit_accounts
  WHERE workspace_id = v_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Account not found');
  END IF;

  v_new_balance := v_new_balance + v_credits_charged;

  INSERT INTO credit_transactions (workspace_id, job_id, type, amount, balance_after, description)
  VALUES (v_workspace_id, p_job_id, 'refund', v_credits_charged, v_new_balance,
          'refund for failed ' || COALESCE(v_job_type, '') || ' job');

  UPDATE credit_accounts
  SET cached_balance = v_new_balance, updated_at = NOW()
  WHERE workspace_id = v_workspace_id;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;
