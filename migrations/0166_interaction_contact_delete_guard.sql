-- Paired with0167 in the same migration-runner transaction. Schema166 is not
-- a supported export/restore milestone before the replacement guard exists.
DROP TRIGGER interaction_immutable_update_guard;
