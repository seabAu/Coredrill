CREATE TRIGGER answer_library_document_update_guard
BEFORE UPDATE OF kind, source ON document
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM answer_library_entry WHERE document_id = OLD.id
) AND (NEW.kind <> 'application_answer' OR NEW.source <> 'answer_library')
BEGIN
  SELECT RAISE(ABORT, 'answer library document identity cannot change');
END;
