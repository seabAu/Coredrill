CREATE INDEX application_active_job_idx
ON application(job_id, updated_at DESC, id)
WHERE archived_at IS NULL;
