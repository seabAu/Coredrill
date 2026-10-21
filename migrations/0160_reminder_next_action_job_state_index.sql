CREATE INDEX reminder_next_action_job_state_idx
ON reminder(next_action_id, job_id, state);
