CREATE INDEX job_source_content_hash_idx
ON job_source(content_hash, job_id)
WHERE content_hash IS NOT NULL;
