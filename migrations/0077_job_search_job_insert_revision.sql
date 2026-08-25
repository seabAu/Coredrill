CREATE TRIGGER job_search_job_insert_revision
AFTER INSERT ON job
BEGIN
  UPDATE job_search_state
  SET content_revision = content_revision + 1, fts_revision = NULL
  WHERE singleton = 1;
END;
