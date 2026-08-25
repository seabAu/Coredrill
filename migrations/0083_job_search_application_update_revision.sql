CREATE TRIGGER job_search_application_update_revision
AFTER UPDATE OF job_id, notes, archived_at ON application
BEGIN
  UPDATE job_search_state
  SET content_revision = content_revision + 1, fts_revision = NULL
  WHERE singleton = 1;
END;
