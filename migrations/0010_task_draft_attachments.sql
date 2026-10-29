ALTER TABLE attachment DROP CONSTRAINT attachment_entity_type_check;
-- statement-breakpoint
ALTER TABLE attachment ADD CONSTRAINT attachment_entity_type_check CHECK (entity_type IN ('task','taskDraft','project','avatar','workspace'));
