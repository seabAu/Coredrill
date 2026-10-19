CREATE TRIGGER document_derivation_origin_delete_guard
BEFORE DELETE ON document_derivation_origin
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM document WHERE id = OLD.document_id)
BEGIN
  SELECT RAISE(ABORT, 'document derivation origin cannot be detached');
END;
