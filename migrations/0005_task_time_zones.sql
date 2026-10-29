ALTER TABLE task ADD COLUMN due_time_zone text;
-- statement-breakpoint
UPDATE task SET due_time_zone=coalesce((SELECT time_zone FROM workspace_setting WHERE id='primary'),'Asia/Jakarta') WHERE due_time IS NOT NULL;
