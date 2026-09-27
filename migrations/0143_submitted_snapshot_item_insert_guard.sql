CREATE TRIGGER submitted_snapshot_item_insert_guard
BEFORE INSERT ON submitted_snapshot_item
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM submitted_snapshot
  INNER JOIN application ON application.id = submitted_snapshot.application_id
  INNER JOIN document_version ON document_version.id = NEW.document_version_id
  INNER JOIN document ON document.id = document_version.document_id
  WHERE submitted_snapshot.id = NEW.submitted_snapshot_id
    AND (
      (NEW.role = 'resume' AND document.kind = 'resume'
        AND application.selected_resume_version_id = NEW.document_version_id) OR
      (NEW.role = 'cover_letter' AND document.kind = 'cover_letter'
        AND application.selected_cover_letter_version_id = NEW.document_version_id) OR
      (NEW.role = 'answer' AND document.kind = 'application_answer') OR
      (NEW.role = 'other' AND document.kind IN ('follow_up', 'other'))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'submitted snapshot item does not match application document state');
END;

