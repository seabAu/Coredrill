CREATE TRIGGER application_answer_selection_insert_guard
BEFORE INSERT ON application_answer_selection
FOR EACH ROW
WHEN
  EXISTS (
    SELECT 1 FROM submitted_snapshot
    WHERE submitted_snapshot.application_id = NEW.application_id
  ) OR
  EXISTS (
    SELECT 1
    FROM application_answer_selection AS existing_selection
    INNER JOIN document_version AS existing_version
      ON existing_version.id = existing_selection.document_version_id
    INNER JOIN document_version AS new_version
      ON new_version.id = NEW.document_version_id
    WHERE existing_selection.application_id = NEW.application_id
      AND existing_version.document_id = new_version.document_id
  ) OR
  NOT EXISTS (
    SELECT 1
    FROM application
    INNER JOIN document_version ON document_version.id = NEW.document_version_id
    INNER JOIN document ON document.id = document_version.document_id
    LEFT JOIN document_lineage ON document_lineage.document_id = document.id
    WHERE application.id = NEW.application_id
      AND document.kind = 'application_answer'
      AND document.archived_at IS NULL
      AND coalesce(document_lineage.role, '') <> 'template'
      AND (
        coalesce(document_lineage.role, '') <> 'job_derivative'
        OR document_lineage.job_id = application.job_id
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'application answer selection is not eligible');
END;
