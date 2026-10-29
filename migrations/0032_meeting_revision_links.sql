ALTER TABLE meeting_action_link DROP CONSTRAINT meeting_action_link_pkey;
ALTER TABLE meeting_action_link ADD PRIMARY KEY(task_id,pack_id);
