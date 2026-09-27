CREATE TABLE career_import_resolution_proposal (
  resolution_id TEXT NOT NULL REFERENCES career_import_resolution(id) ON DELETE CASCADE,
  proposal_id TEXT PRIMARY KEY NOT NULL REFERENCES career_import_proposal(id) ON DELETE CASCADE,
  linked_at TEXT NOT NULL CHECK (length(linked_at) = 24),
  UNIQUE(resolution_id, proposal_id)
) STRICT;
