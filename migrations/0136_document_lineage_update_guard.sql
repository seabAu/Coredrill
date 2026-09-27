CREATE TRIGGER document_lineage_update_guard
BEFORE UPDATE ON document_lineage
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'document lineage is immutable');
END;

