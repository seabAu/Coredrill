CREATE INDEX job_normalized_title_active_idx
ON job(normalized_title, updated_at DESC, id)
WHERE archived_at IS NULL AND normalized_title IS NOT NULL;
