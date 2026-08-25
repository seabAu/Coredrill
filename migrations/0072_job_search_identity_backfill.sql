INSERT INTO job_search_identity(job_id)
SELECT id FROM job ORDER BY created_at, id;
