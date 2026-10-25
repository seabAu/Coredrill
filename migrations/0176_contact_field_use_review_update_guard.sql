CREATE TRIGGER contact_field_use_review_update_guard
BEFORE UPDATE ON contact_field_use_review
FOR EACH ROW
WHEN OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_at < OLD.reviewed_at
  OR NEW.row_version <> OLD.row_version+1
  OR NEW.id IS NOT OLD.id
  OR NEW.vault_id IS NOT OLD.vault_id
  OR NEW.contact_id IS NOT OLD.contact_id
  OR NEW.operation_id IS NOT OLD.operation_id
  OR NEW.field_name IS NOT OLD.field_name
  OR NEW.field_revision IS NOT OLD.field_revision
  OR NEW.contact_row_version IS NOT OLD.contact_row_version
  OR NEW.value_hash IS NOT OLD.value_hash
  OR NEW.source_snapshot_id IS NOT OLD.source_snapshot_id
  OR NEW.source_snapshot_hash IS NOT OLD.source_snapshot_hash
  OR NEW.source_start_byte IS NOT OLD.source_start_byte
  OR NEW.source_end_byte IS NOT OLD.source_end_byte
  OR NEW.source_excerpt IS NOT OLD.source_excerpt
  OR NEW.policy_id IS NOT OLD.policy_id
  OR NEW.policy_revision IS NOT OLD.policy_revision
  OR NEW.purpose IS NOT OLD.purpose
  OR NEW.purpose_note IS NOT OLD.purpose_note
  OR NEW.acknowledgement IS NOT OLD.acknowledgement
  OR NEW.reviewed_at IS NOT OLD.reviewed_at
  OR NEW.review_due_at IS NOT OLD.review_due_at
  OR NEW.expires_at IS NOT OLD.expires_at
BEGIN
  SELECT RAISE(ABORT, 'contact field-use review only permits explicit revocation');
END;
