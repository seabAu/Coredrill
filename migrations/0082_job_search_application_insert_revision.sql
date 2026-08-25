CREATE TRIGGER job_search_application_insert_revision
AFTER INSERT ON application
BEGIN
  UPDATE job_search_state
  SET content_revision = content_revision + 1, fts_revision = NULL
  WHERE singleton = 1;
END;
