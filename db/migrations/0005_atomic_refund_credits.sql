-- Atomic credit refund function (prevents duplicate refunds on webhook retries)
CREATE OR REPLACE FUNCTION refund_credits(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_job record;
  v_new_balance int;
  v_workspace_id uuid;
  v_credits_charged int;
BEGIN
  -- Fetch job details (with row lock to prevent concurrent updates)
  SELECT workspace_id, credits_charged, type INTO v_workspace_id, v_credits_charged, v_job
  FROM creative_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  -- If job not found or no credits charged, skip refund
  IF NOT FOUND OR v_credits_charged = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No credits to refund');
  END IF;

  -- Fetch account balance with row lock
  SELECT cached_balance INTO v_new_balance
  FROM credit_accounts
  WHERE workspace_id = v_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Account not found');
  END IF;

  v_new_balance := v_new_balance + v_credits_charged;

  -- Insert refund transaction (idempotent: use unique constraint on job_id + type)
  INSERT INTO credit_transactions (workspace_id, job_id, type, amount, balance_after, description)
  VALUES (v_workspace_id, p_job_id, 'refund', v_credits_charged, v_new_balance,
          'refund for failed ' || v_job || ' job')
  ON CONFLICT (workspace_id, job_id, type) DO NOTHING;

  -- Update balance
  UPDATE credit_accounts
  SET cached_balance = v_new_balance, updated_at = NOW()
  WHERE workspace_id = v_workspace_id;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;

-- Create unique constraint on (workspace_id, job_id, type) for credit_transactions
-- This prevents duplicate refunds on the same job
ALTER TABLE credit_transactions
ADD CONSTRAINT unique_transaction_per_job_type UNIQUE (workspace_id, job_id, type)
WHERE type = 'refund';
