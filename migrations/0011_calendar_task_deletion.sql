-- Retain Calendar work after a task is permanently deleted. The worker uses the
-- deterministic task ID to remove the remote event and then clears these rows.
-- Member foreign keys and the (email, task_id) primary keys remain intact.
ALTER TABLE calendar_job DROP CONSTRAINT calendar_job_task_id_fkey;
ALTER TABLE calendar_event DROP CONSTRAINT calendar_event_task_id_fkey;
