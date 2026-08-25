CREATE INDEX job_source_job_connector_idx
ON job_source(job_id, connector_id)
WHERE connector_id IS NOT NULL;
