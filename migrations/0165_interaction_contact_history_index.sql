CREATE INDEX interaction_contact_history_idx
ON interaction(contact_id, occurred_at DESC, id ASC);
