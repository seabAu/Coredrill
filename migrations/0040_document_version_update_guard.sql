CREATE TRIGGER document_version_immutable_update_guard
BEFORE UPDATE ON document_version
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'document versions are immutable');
END;
