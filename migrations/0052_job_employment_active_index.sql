CREATE INDEX job_employment_active_idx
ON job(employment_type, updated_at DESC, id)
WHERE archived_at IS NULL AND employment_type IS NOT NULL;
