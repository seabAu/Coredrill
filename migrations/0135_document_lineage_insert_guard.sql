CREATE TRIGGER document_lineage_insert_guard
BEFORE INSERT ON document_lineage
FOR EACH ROW
WHEN NEW.role = 'job_derivative' AND (
  NOT EXISTS (
    SELECT 1 FROM document_lineage
    WHERE document_id = NEW.base_document_id AND role = 'base'
  ) OR (
    NEW.template_document_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM document_lineage
      WHERE document_id = NEW.template_document_id AND role = 'template'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'document lineage requires typed base and template documents');
END;

