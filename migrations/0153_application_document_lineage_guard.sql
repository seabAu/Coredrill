CREATE TRIGGER application_document_lineage_insert_guard
BEFORE INSERT ON application
FOR EACH ROW
WHEN
  (NEW.selected_resume_version_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM document_version
    INNER JOIN document ON document.id = document_version.document_id
    LEFT JOIN document_lineage ON document_lineage.document_id = document.id
    WHERE document_version.id = NEW.selected_resume_version_id
      AND (
        document.archived_at IS NOT NULL OR
        document_lineage.role = 'template' OR
        (document_lineage.role = 'job_derivative' AND document_lineage.job_id <> NEW.job_id)
      )
  )) OR
  (NEW.selected_cover_letter_version_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM document_version
    INNER JOIN document ON document.id = document_version.document_id
    LEFT JOIN document_lineage ON document_lineage.document_id = document.id
    WHERE document_version.id = NEW.selected_cover_letter_version_id
      AND (
        document.archived_at IS NOT NULL OR
        document_lineage.role = 'template' OR
        (document_lineage.role = 'job_derivative' AND document_lineage.job_id <> NEW.job_id)
      )
  ))
BEGIN
  SELECT RAISE(ABORT, 'application document version is not eligible for this job');
END;
