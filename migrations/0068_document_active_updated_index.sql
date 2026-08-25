CREATE INDEX document_active_updated_idx
ON document(updated_at DESC, id)
WHERE archived_at IS NULL;
