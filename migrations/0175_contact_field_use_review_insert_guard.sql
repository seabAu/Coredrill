CREATE TRIGGER contact_field_use_review_insert_guard
BEFORE INSERT ON contact_field_use_review
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM contact_field_use_review WHERE id=NEW.id OR operation_id=NEW.operation_id
    OR (contact_id=NEW.contact_id AND field_name=NEW.field_name AND field_revision=NEW.field_revision))
  OR (SELECT count(*) FROM vault) <> 1
  OR NEW.revoked_at IS NOT NULL OR NEW.row_version <> 1
  OR NEW.field_revision <> COALESCE((SELECT max(field_revision) FROM contact_field_use_review
      WHERE contact_id=NEW.contact_id AND field_name=NEW.field_name),0)+1
  OR EXISTS (SELECT 1 FROM contact_field_use_review WHERE contact_id=NEW.contact_id
      AND field_name=NEW.field_name AND COALESCE(revoked_at,reviewed_at) > NEW.reviewed_at)
  OR NOT EXISTS (
    SELECT 1 FROM contact c WHERE c.id=NEW.contact_id AND c.archived_at IS NULL
      AND c.row_version=NEW.contact_row_version AND c.updated_at <= NEW.reviewed_at
      AND NEW.source_excerpt=CASE NEW.field_name WHEN 'name' THEN c.name WHEN 'role' THEN c.role
        WHEN 'email' THEN c.email WHEN 'phone' THEN c.phone WHEN 'public_profile_url' THEN c.public_profile_url END
  )
  OR NOT EXISTS (
    SELECT 1 FROM contact_source_snapshot s WHERE s.id=NEW.source_snapshot_id AND s.vault_id=NEW.vault_id
      AND s.content_hash=NEW.source_snapshot_hash AND s.captured_at <= NEW.reviewed_at AND s.created_at <= NEW.reviewed_at
      AND NEW.source_end_byte <= length(CAST(s.raw_text AS BLOB))
      AND CAST(substr(CAST(s.raw_text AS BLOB),NEW.source_start_byte+1,NEW.source_end_byte-NEW.source_start_byte) AS TEXT)=NEW.source_excerpt
  )
  OR NOT EXISTS (
    SELECT 1 FROM contact_source_use_policy p WHERE p.id=NEW.policy_id AND p.vault_id=NEW.vault_id
      AND p.revision=NEW.policy_revision AND p.status='enabled' AND p.field_name=NEW.field_name
      AND p.source_snapshot_id=NEW.source_snapshot_id AND p.source_snapshot_hash=NEW.source_snapshot_hash
      AND p.purpose=NEW.purpose AND p.reviewed_at <= NEW.reviewed_at AND NEW.reviewed_at < p.review_due_at
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid exact-value contact field review');
END;
