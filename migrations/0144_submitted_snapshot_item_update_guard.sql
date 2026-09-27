CREATE TRIGGER submitted_snapshot_item_update_guard
BEFORE UPDATE ON submitted_snapshot_item
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'submitted snapshot items are immutable');
END;

