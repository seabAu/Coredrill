ALTER TABLE anecdote ADD COLUMN privacy_tags_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(privacy_tags_json) AND json_type(privacy_tags_json) = 'array' AND length(privacy_tags_json) <= 20000);
