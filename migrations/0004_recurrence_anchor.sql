ALTER TABLE task ADD COLUMN recurrence_anchor_day integer CHECK(recurrence_anchor_day BETWEEN 1 AND 31);
UPDATE task SET recurrence_anchor_day=substring(due_date,9,2)::integer WHERE recurrence IS NOT NULL AND due_date ~ '^\d{4}-\d{2}-\d{2}$' AND substring(due_date,9,2)::integer BETWEEN 1 AND 31;
