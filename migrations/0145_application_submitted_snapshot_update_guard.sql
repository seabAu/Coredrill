CREATE TRIGGER application_submitted_snapshot_update_guard
BEFORE UPDATE OF job_id, applied_at, channel, selected_resume_version_id,
  selected_cover_letter_version_id ON application
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM submitted_snapshot WHERE application_id = OLD.id
) AND (
  NEW.job_id IS NOT OLD.job_id OR
  NEW.applied_at IS NOT OLD.applied_at OR
  NEW.channel IS NOT OLD.channel OR
  NEW.selected_resume_version_id IS NOT OLD.selected_resume_version_id OR
  NEW.selected_cover_letter_version_id IS NOT OLD.selected_cover_letter_version_id
)
BEGIN
  SELECT RAISE(ABORT, 'submitted application identity is immutable');
END;

