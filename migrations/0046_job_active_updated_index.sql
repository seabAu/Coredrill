CREATE INDEX job_active_updated_idx
ON job(updated_at DESC, id)
WHERE archived_at IS NULL;
