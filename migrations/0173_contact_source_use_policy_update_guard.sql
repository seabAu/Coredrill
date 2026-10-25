CREATE TRIGGER contact_source_use_policy_update_guard
BEFORE UPDATE ON contact_source_use_policy
FOR EACH ROW
WHEN OLD.status <> 'enabled' OR NEW.status <> 'disabled' OR OLD.disabled_at IS NOT NULL
  OR NEW.disabled_at IS NULL OR NEW.disabled_at < OLD.reviewed_at OR NEW.row_version <> OLD.row_version+1
  OR NEW.id IS NOT OLD.id
  OR NEW.vault_id IS NOT OLD.vault_id
  OR NEW.operation_id IS NOT OLD.operation_id
  OR NEW.revision IS NOT OLD.revision
  OR NEW.source_snapshot_id IS NOT OLD.source_snapshot_id
  OR NEW.source_snapshot_hash IS NOT OLD.source_snapshot_hash
  OR NEW.source_url IS NOT OLD.source_url
  OR NEW.source_class IS NOT OLD.source_class
  OR NEW.field_name IS NOT OLD.field_name
  OR NEW.rights_basis IS NOT OLD.rights_basis
  OR NEW.purpose IS NOT OLD.purpose
  OR NEW.usage IS NOT OLD.usage
  OR NEW.terms_snapshot_id IS NOT OLD.terms_snapshot_id
  OR NEW.terms_snapshot_hash IS NOT OLD.terms_snapshot_hash
  OR NEW.terms_start_byte IS NOT OLD.terms_start_byte
  OR NEW.terms_end_byte IS NOT OLD.terms_end_byte
  OR NEW.terms_excerpt IS NOT OLD.terms_excerpt
  OR NEW.permission_kind IS NOT OLD.permission_kind
  OR NEW.acknowledgement IS NOT OLD.acknowledgement
  OR NEW.reviewed_at IS NOT OLD.reviewed_at
  OR NEW.review_due_at IS NOT OLD.review_due_at
BEGIN
  SELECT RAISE(ABORT, 'contact source-use review only permits explicit disable');
END;
