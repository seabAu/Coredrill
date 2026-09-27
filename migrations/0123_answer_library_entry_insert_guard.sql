CREATE TRIGGER answer_library_entry_insert_guard
BEFORE INSERT ON answer_library_entry
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM document
  WHERE document.id = NEW.document_id
    AND document.kind = 'application_answer'
    AND document.source = 'answer_library'
)
BEGIN
  SELECT RAISE(ABORT, 'answer library entry requires an answer-library document');
END;
