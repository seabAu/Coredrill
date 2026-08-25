CREATE INDEX interaction_timeline_idx
ON interaction(job_id, occurred_at, id);
