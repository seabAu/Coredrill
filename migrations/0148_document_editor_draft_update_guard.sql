CREATE TRIGGER document_editor_draft_update_guard
BEFORE UPDATE ON document_editor_draft
BEGIN
  SELECT CASE WHEN
    NEW.document_id <> OLD.document_id OR
    NEW.base_version_id <> OLD.base_version_id OR
    NEW.content_ir_version <> OLD.content_ir_version OR
    NEW.row_version <> OLD.row_version + 1 OR
    NOT EXISTS (
      SELECT 1
      FROM document_version
      WHERE document_version.id = NEW.base_version_id
        AND document_version.document_id = NEW.document_id
        AND document_version.version_number = (
          SELECT max(latest.version_number)
          FROM document_version AS latest
          WHERE latest.document_id = NEW.document_id
        )
    )
  THEN RAISE(ABORT, 'document editor draft update violates optimistic lineage') END;
END;
