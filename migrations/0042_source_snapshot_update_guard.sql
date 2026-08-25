CREATE TRIGGER source_snapshot_immutable_update_guard
BEFORE UPDATE ON source_snapshot
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'source snapshots are append-only');
END;
