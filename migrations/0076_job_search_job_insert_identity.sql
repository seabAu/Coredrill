CREATE TRIGGER job_search_job_insert_identity
AFTER INSERT ON job
BEGIN
  INSERT INTO job_search_identity(job_id) VALUES (new.id);
END;
