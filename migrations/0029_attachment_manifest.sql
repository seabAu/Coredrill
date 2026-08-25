CREATE TABLE attachment_manifest (
  content_id TEXT PRIMARY KEY NOT NULL CHECK (
    length(content_id) = 64 AND
    content_id = lower(content_id) AND
    content_id NOT GLOB '*[^0-9a-f]*'
  ),
  media_type TEXT NOT NULL CHECK (length(media_type) BETWEEN 3 AND 255),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24)
) STRICT;
