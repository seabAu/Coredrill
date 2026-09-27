CREATE TRIGGER submitted_snapshot_insert_guard
BEFORE INSERT ON submitted_snapshot
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM application
  INNER JOIN status_definition ON status_definition.id = application.current_status_id
  WHERE application.id = NEW.application_id
    AND application.applied_at = NEW.submitted_at
    AND application.channel IS NEW.channel
    AND status_definition.category = 'applied'
)
BEGIN
  SELECT RAISE(ABORT, 'submitted snapshot requires matching applied application state');
END;

