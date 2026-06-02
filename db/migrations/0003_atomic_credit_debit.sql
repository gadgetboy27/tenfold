-- Atomic credit debit function to prevent race conditions
-- Uses FOR UPDATE to lock the row during the transaction

CREATE OR REPLACE FUNCTION debit_credits(
  p_workspace_id uuid,
  p_job_id uuid,
  p_cost int,
  p_description text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_new_balance int;
  v_result jsonb;
BEGIN
  SELECT cached_balance INTO v_new_balance
  FROM credit_accounts
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Account not found', 'balance', 0);
  END IF;

  IF v_new_balance < p_cost THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Insufficient credits', 'balance', v_new_balance);
  END IF;

  v_new_balance := v_new_balance - p_cost;

  INSERT INTO credit_transactions (workspace_id, job_id, type, amount, balance_after, description)
  VALUES (p_workspace_id, p_job_id, 'spend', -p_cost, v_new_balance, p_description);

  UPDATE credit_accounts
  SET cached_balance = v_new_balance, updated_at = NOW()
  WHERE workspace_id = p_workspace_id;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;
