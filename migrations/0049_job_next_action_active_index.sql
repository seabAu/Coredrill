CREATE INDEX job_next_action_active_idx
ON job(next_action_at, id)
WHERE archived_at IS NULL AND next_action_at IS NOT NULL;
