CREATE TRIGGER submitted_snapshot_update_guard
BEFORE UPDATE ON submitted_snapshot
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'submitted snapshots are immutable');
END;

