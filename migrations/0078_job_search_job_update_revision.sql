CREATE TRIGGER job_search_job_update_revision
AFTER UPDATE OF company_id, title, normalized_title, description_text, archived_at ON job
BEGIN
  UPDATE job_search_state
  SET content_revision = content_revision + 1, fts_revision = NULL
  WHERE singleton = 1;
END;
