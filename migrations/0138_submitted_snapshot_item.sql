CREATE TABLE submitted_snapshot_item (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  submitted_snapshot_id TEXT NOT NULL REFERENCES submitted_snapshot(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('resume', 'cover_letter', 'answer', 'other')),
  document_version_id TEXT NOT NULL REFERENCES document_version(id) ON DELETE RESTRICT,
  submission_format TEXT NOT NULL CHECK (submission_format IN ('file', 'plain_text')),
  content_id TEXT CHECK (
    content_id IS NULL OR (
      length(content_id) = 64 AND content_id = lower(content_id)
      AND content_id NOT GLOB '*[^0-9a-f]*'
    )
  ),
  attachment_purpose TEXT CHECK (
    attachment_purpose IS NULL OR length(attachment_purpose) BETWEEN 1 AND 128
  ),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  UNIQUE (submitted_snapshot_id, role, sort_order),
  CHECK (
    (submission_format = 'plain_text' AND content_id IS NULL AND attachment_purpose IS NULL) OR
    (submission_format = 'file' AND content_id IS NOT NULL AND attachment_purpose IS NOT NULL)
  ),
  FOREIGN KEY (document_version_id, content_id, attachment_purpose)
    REFERENCES document_version_attachment(document_version_id, content_id, purpose)
    ON DELETE RESTRICT
) STRICT;

