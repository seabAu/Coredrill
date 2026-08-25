CREATE TRIGGER document_version_lineage_insert_guard
BEFORE INSERT ON document_version
FOR EACH ROW
WHEN
  (NEW.version_number = 1 AND NEW.parent_version_id IS NOT NULL) OR
  (NEW.version_number > 1 AND NOT EXISTS (
    SELECT 1
    FROM document_version AS parent
    WHERE parent.id = NEW.parent_version_id
      AND parent.document_id = NEW.document_id
      AND parent.version_number = NEW.version_number - 1
  ))
BEGIN
  SELECT RAISE(ABORT, 'document version lineage mismatch');
END;
