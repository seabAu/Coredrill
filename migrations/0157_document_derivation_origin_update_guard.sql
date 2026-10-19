CREATE TRIGGER document_derivation_origin_update_guard
BEFORE UPDATE ON document_derivation_origin
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'document derivation origin is immutable');
END;
