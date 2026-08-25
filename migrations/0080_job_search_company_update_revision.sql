CREATE TRIGGER job_search_company_update_revision
AFTER UPDATE OF canonical_name, notes ON company
BEGIN
  UPDATE job_search_state
  SET content_revision = content_revision + 1, fts_revision = NULL
  WHERE singleton = 1;
END;
