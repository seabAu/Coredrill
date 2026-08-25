CREATE INDEX job_status_active_idx
ON job(current_status_id, updated_at DESC, id)
WHERE archived_at IS NULL AND current_status_id IS NOT NULL;
