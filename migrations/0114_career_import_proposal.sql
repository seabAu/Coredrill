CREATE TABLE career_import_proposal (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  import_run_id TEXT NOT NULL REFERENCES import_run(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN (
    'basics', 'employment', 'education', 'project', 'skill', 'accomplishment',
    'certification', 'publication', 'volunteer', 'unclassified'
  )),
  field_name TEXT NOT NULL CHECK (length(trim(field_name)) BETWEEN 1 AND 64),
  group_key TEXT NOT NULL CHECK (length(trim(group_key)) BETWEEN 1 AND 128),
  proposed_value TEXT NOT NULL CHECK (length(trim(proposed_value)) BETWEEN 1 AND 20000),
  source_pointer TEXT NOT NULL CHECK (length(trim(source_pointer)) BETWEEN 1 AND 300),
  source_excerpt TEXT NOT NULL CHECK (length(source_excerpt) <= 240),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  evidence_status TEXT NOT NULL DEFAULT 'proposal' CHECK (evidence_status = 'proposal'),
  review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state = 'pending'),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE(import_run_id, id)
) STRICT;
