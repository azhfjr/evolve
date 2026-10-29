ALTER TABLE task ADD COLUMN start_date text;
-- statement-breakpoint
ALTER TABLE task ADD CONSTRAINT task_start_date_valid CHECK (
  start_date IS NULL OR (
    start_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND to_char(start_date::date, 'YYYY-MM-DD') = start_date
    AND due_date IS NOT NULL
    AND start_date <= due_date
  )
);
