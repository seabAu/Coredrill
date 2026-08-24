CREATE TABLE capture_inbox (
  envelope_id TEXT PRIMARY KEY NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (length(content_hash) = 64),
  envelope_checksum TEXT NOT NULL CHECK (length(envelope_checksum) = 64),
  sender_id TEXT NOT NULL CHECK (length(sender_id) BETWEEN 1 AND 256),
  sender_sequence INTEGER NOT NULL CHECK (sender_sequence >= 0),
  sender_nonce TEXT NOT NULL UNIQUE CHECK (length(sender_nonce) BETWEEN 22 AND 128),
  captured_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  received_via TEXT NOT NULL CHECK (received_via IN ('external_message', 'manual_export')),
  envelope_json TEXT NOT NULL,
  UNIQUE (sender_id, sender_sequence)
) STRICT;
