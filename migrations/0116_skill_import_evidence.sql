ALTER TABLE skill ADD COLUMN source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL;
