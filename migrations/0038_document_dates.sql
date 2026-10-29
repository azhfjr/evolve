-- Calendar metadata belongs to the document, not its uploaded revisions.
ALTER TABLE logical_document ADD COLUMN document_date date;
-- statement-breakpoint
CREATE INDEX logical_document_storyline ON logical_document(entity_type,entity_id,document_date,id) WHERE current_attachment_id IS NOT NULL;
