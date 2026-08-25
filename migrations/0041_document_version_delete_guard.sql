CREATE TRIGGER document_version_selected_delete_guard
BEFORE DELETE ON document_version
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM application
  WHERE application.selected_resume_version_id = OLD.id
     OR application.selected_cover_letter_version_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'selected document version cannot be deleted');
END;
