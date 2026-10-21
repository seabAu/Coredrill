CREATE INDEX next_action_job_created_idx
ON next_action(job_id, created_at DESC, id ASC);
