CREATE TRIGGER job_requirement_source_update_guard
BEFORE UPDATE ON job_requirement
FOR EACH ROW
WHEN NEW.job_id <> OLD.job_id
  OR NEW.source_category <> OLD.source_category
  OR NEW.normalized_text <> OLD.normalized_text
  OR NEW.raw_text <> OLD.raw_text
  OR NEW.provenance_id <> OLD.provenance_id
  OR NEW.confidence <> OLD.confidence
  OR NEW.sort_order <> OLD.sort_order
  OR NEW.created_at <> OLD.created_at
  OR (OLD.user_confirmed = 1 AND NEW.user_confirmed <> 1)
BEGIN
  SELECT RAISE(ABORT, 'job requirement source facts are immutable');
END;
