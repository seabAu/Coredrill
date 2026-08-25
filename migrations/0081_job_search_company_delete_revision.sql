CREATE TRIGGER job_search_company_delete_revision
AFTER DELETE ON company
BEGIN
  UPDATE job_search_state
  SET content_revision = content_revision + 1, fts_revision = NULL
  WHERE singleton = 1;
END;
