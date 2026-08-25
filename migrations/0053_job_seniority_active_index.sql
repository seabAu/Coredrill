CREATE INDEX job_seniority_active_idx
ON job(seniority, updated_at DESC, id)
WHERE archived_at IS NULL AND seniority IS NOT NULL;
