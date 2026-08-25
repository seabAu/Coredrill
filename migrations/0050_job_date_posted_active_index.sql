CREATE INDEX job_date_posted_active_idx
ON job(date_posted DESC, id)
WHERE archived_at IS NULL AND date_posted IS NOT NULL;
