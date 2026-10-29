CREATE TABLE workspace_change(revision bigint NOT NULL,entity text NOT NULL,entity_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX workspace_change_revision_idx ON workspace_change(revision);
-- statement-breakpoint
CREATE FUNCTION connected_entity_changed() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r bigint; entity_id text; BEGIN
 IF TG_TABLE_NAME='task' AND NOT (SELECT enabled FROM connected_workspace WHERE id='primary') THEN RETURN NULL; END IF;
 entity_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 UPDATE workspace_setting SET revision=revision+1 WHERE id='primary' RETURNING revision INTO r;
 INSERT INTO workspace_change(revision,entity,entity_id) VALUES(r,TG_TABLE_NAME,entity_id);
 PERFORM pg_notify('evolve_changed','refresh'); RETURN NULL;
END $$;
CREATE TRIGGER board_shared_changed AFTER INSERT OR UPDATE OR DELETE ON board_room_project FOR EACH ROW EXECUTE FUNCTION connected_entity_changed();
CREATE TRIGGER asset_shared_changed AFTER INSERT OR UPDATE OR DELETE ON board_asset FOR EACH ROW EXECUTE FUNCTION connected_entity_changed();
CREATE TRIGGER task_shared_changed AFTER INSERT OR UPDATE OR DELETE ON task FOR EACH ROW EXECUTE FUNCTION connected_entity_changed();
