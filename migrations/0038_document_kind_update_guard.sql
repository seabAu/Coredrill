CREATE TRIGGER document_kind_selection_guard
BEFORE UPDATE OF kind ON document
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM document_version
  INNER JOIN application ON
    application.selected_resume_version_id = document_version.id OR
    application.selected_cover_letter_version_id = document_version.id
  WHERE document_version.document_id = OLD.id AND (
    (application.selected_resume_version_id = document_version.id AND NEW.kind <> 'resume') OR
    (application.selected_cover_letter_version_id = document_version.id AND NEW.kind <> 'cover_letter')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'selected document kind cannot change');
END;
