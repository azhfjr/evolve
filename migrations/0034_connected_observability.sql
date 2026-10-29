CREATE TABLE workspace_operation_metric(route text NOT NULL,bucket timestamptz NOT NULL,requests bigint NOT NULL DEFAULT 0,errors bigint NOT NULL DEFAULT 0,b50 bigint NOT NULL DEFAULT 0,b100 bigint NOT NULL DEFAULT 0,b250 bigint NOT NULL DEFAULT 0,b500 bigint NOT NULL DEFAULT 0,b1000 bigint NOT NULL DEFAULT 0,over1000 bigint NOT NULL DEFAULT 0,PRIMARY KEY(route,bucket));
CREATE INDEX workspace_operation_metric_bucket_idx ON workspace_operation_metric(bucket);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION connected_entity_changed() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r bigint; entity_id text; BEGIN
 IF TG_TABLE_NAME='task' AND NOT (SELECT enabled FROM connected_workspace WHERE id='primary') THEN RETURN NULL; END IF;
 entity_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF TG_TABLE_NAME='board_room_project' THEN UPDATE board_room_config SET revision=revision+1 WHERE id='primary'; END IF;
 UPDATE workspace_setting SET revision=revision+1 WHERE id='primary' RETURNING revision INTO r;
 INSERT INTO workspace_change(revision,entity,entity_id) VALUES(r,TG_TABLE_NAME,entity_id);
 PERFORM pg_notify('evolve_changed','refresh'); RETURN NULL;
END $$;
