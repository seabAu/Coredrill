CREATE TRIGGER application_document_kind_insert_guard
BEFORE INSERT ON application
FOR EACH ROW
WHEN
  (NEW.selected_resume_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM document_version
    INNER JOIN document ON document.id = document_version.document_id
    WHERE document_version.id = NEW.selected_resume_version_id AND document.kind = 'resume'
  )) OR
  (NEW.selected_cover_letter_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM document_version
    INNER JOIN document ON document.id = document_version.document_id
    WHERE document_version.id = NEW.selected_cover_letter_version_id
      AND document.kind = 'cover_letter'
  ))
BEGIN
  SELECT RAISE(ABORT, 'application document version kind mismatch');
END;
