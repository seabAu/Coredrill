CREATE TRIGGER answer_library_version_insert_guard
BEFORE INSERT ON answer_library_version
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM document_version
  INNER JOIN answer_library_entry
    ON answer_library_entry.document_id = document_version.document_id
  WHERE document_version.id = NEW.document_version_id
)
BEGIN
  SELECT RAISE(ABORT, 'answer library version requires an answer-library document version');
END;
