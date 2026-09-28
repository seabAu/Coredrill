CREATE TRIGGER document_editor_draft_insert_guard
BEFORE INSERT ON document_editor_draft
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM document_version
    WHERE document_version.id = NEW.base_version_id
      AND document_version.document_id = NEW.document_id
      AND document_version.version_number = (
        SELECT max(latest.version_number)
        FROM document_version AS latest
        WHERE latest.document_id = NEW.document_id
      )
  ) THEN RAISE(ABORT, 'document editor draft must extend the latest version') END;
END;
