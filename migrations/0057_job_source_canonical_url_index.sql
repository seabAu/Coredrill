CREATE INDEX job_source_canonical_url_idx
ON job_source(canonical_url, job_id)
WHERE canonical_url IS NOT NULL;
