ALTER TABLE project ADD COLUMN labels jsonb NOT NULL DEFAULT '[]'::jsonb;
-- statement-breakpoint
ALTER TABLE project ADD CONSTRAINT project_labels_array CHECK (jsonb_typeof(labels) = 'array' AND jsonb_array_length(labels) <= 10);
