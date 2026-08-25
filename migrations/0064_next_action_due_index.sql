CREATE INDEX next_action_due_idx
ON next_action(state, due_at, job_id, id)
WHERE due_at IS NOT NULL;
