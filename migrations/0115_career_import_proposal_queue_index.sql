CREATE INDEX career_import_proposal_pending_queue_idx
  ON career_import_proposal(review_state, created_at DESC, import_run_id, id);
