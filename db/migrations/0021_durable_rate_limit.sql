-- Durable, shared rate limiting.
--
-- The in-memory limiter (lib/security/rate-limit.ts) has two silent weaknesses:
-- it resets on every deploy, and each Railway instance keeps its OWN counter,
-- so scaling to N instances multiplies the effective limit by N. A security
-- control that quietly weakens when you deploy or scale is barely a control.
--
-- Worse, the generation endpoints that actually spend fal.ai money
-- (/api/jobs, /api/campaigns) use getSession directly and never touched the
-- limiter at all. Backing it with Postgres — already provisioned, no new infra
-- — makes one counter shared across instances that survives deploys.

CREATE TABLE IF NOT EXISTS rate_limits (
  key           text PRIMARY KEY,
  count         int NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_count int;
  v_start timestamptz;
  v_now   timestamptz := now();
  v_reset timestamptz;
BEGIN
  INSERT INTO rate_limits (key, count, window_start)
  VALUES (p_key, 0, v_now)
  ON CONFLICT (key) DO NOTHING;

  SELECT count, window_start INTO v_count, v_start
  FROM rate_limits WHERE key = p_key FOR UPDATE;

  IF v_now - v_start >= make_interval(secs => p_window_seconds) THEN
    v_count := 0;
    v_start := v_now;
  END IF;

  v_reset := v_start + make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'reset_at', v_reset);
  END IF;

  v_count := v_count + 1;
  UPDATE rate_limits SET count = v_count, window_start = v_start WHERE key = p_key;

  RETURN jsonb_build_object('allowed', true, 'remaining', p_max - v_count, 'reset_at', v_reset);
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_rate_limits(p_older_than_seconds int DEFAULT 3600)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < now() - make_interval(secs => p_older_than_seconds);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
