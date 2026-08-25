CREATE INDEX job_workplace_active_idx
ON job(workplace_type, updated_at DESC, id)
WHERE archived_at IS NULL AND workplace_type IS NOT NULL;
