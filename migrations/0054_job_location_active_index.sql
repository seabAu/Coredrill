CREATE INDEX job_location_active_idx
ON job(location_id, updated_at DESC, id)
WHERE archived_at IS NULL AND location_id IS NOT NULL;
