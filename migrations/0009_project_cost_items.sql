ALTER TABLE project ADD COLUMN cost_items jsonb;
-- statement-breakpoint
ALTER TABLE project ADD CONSTRAINT project_cost_items_array CHECK (cost_items IS NULL OR (jsonb_typeof(cost_items) = 'array' AND jsonb_array_length(cost_items) <= 50));
