-- Honor the existing contact foreign key's ON DELETE SET NULL action while
-- retaining append-only interaction content and forbidding ordinary relinking.
CREATE TRIGGER interaction_immutable_update_guard
BEFORE UPDATE ON interaction
FOR EACH ROW
WHEN NOT (
  OLD.contact_id IS NOT NULL
  AND NEW.contact_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM contact WHERE id = OLD.contact_id)
  AND NEW.id IS OLD.id
  AND NEW.job_id IS OLD.job_id
  AND NEW.type IS OLD.type
  AND NEW.occurred_at IS OLD.occurred_at
  AND NEW.direction IS OLD.direction
  AND NEW.summary IS OLD.summary
  AND NEW.next_action_at IS OLD.next_action_at
  AND NEW.created_at IS OLD.created_at
  AND NEW.updated_at IS OLD.updated_at
  AND NEW.row_version IS OLD.row_version
)
BEGIN
  SELECT RAISE(ABORT, 'interactions are append-only');
END;
