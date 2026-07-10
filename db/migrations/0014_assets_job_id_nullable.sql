-- composed_video (compositor exports, incl. fan-out per-format renders) and the
-- publish-time music mix are inserted with no originating creative_job, so
-- job_id must be nullable for those inserts to succeed. Previously these inserts
-- failed the NOT NULL constraint silently (the callers didn't check the error),
-- so no composed_video asset rows were ever created.
ALTER TABLE assets ALTER COLUMN job_id DROP NOT NULL;
