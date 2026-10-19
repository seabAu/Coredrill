CREATE TRIGGER document_derivation_origin_insert_guard
BEFORE INSERT ON document_derivation_origin
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM document_lineage AS lineage
  JOIN document AS derived ON derived.id = lineage.document_id
  JOIN document_version AS first ON first.id = NEW.first_version_id
  JOIN document_version AS source ON source.id = NEW.source_version_id
  JOIN document AS base ON base.id = source.document_id
  JOIN document_lineage AS base_lineage ON base_lineage.document_id = base.id
  WHERE lineage.document_id = NEW.document_id
    AND lineage.role = 'job_derivative'
    AND first.document_id = NEW.document_id AND first.version_number = 1
    AND first.parent_version_id IS NULL
    AND source.document_id = lineage.base_document_id
    AND base_lineage.role = 'base'
    AND derived.kind = base.kind AND base.kind IN ('resume', 'cover_letter')
    AND derived.archived_at IS NULL AND base.archived_at IS NULL
    AND first.content_ir_version = source.content_ir_version
    AND first.content_ir_json = source.content_ir_json
    AND first.content_plain = source.content_plain
    AND first.content_hash = source.content_hash
    AND NEW.created_at = first.created_at
    AND NEW.created_at >= source.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'invalid exact document derivation origin');
END;
