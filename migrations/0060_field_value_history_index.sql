CREATE INDEX field_value_history_idx
ON field_value(entity_type, entity_id, field_name, created_at, id);
