ALTER TABLE project ADD COLUMN cost_version integer NOT NULL DEFAULT 1;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION protect_canonical_project() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT enabled FROM connected_workspace WHERE id='primary') AND pg_trigger_depth()<2 THEN
  IF TG_OP='UPDATE' AND OLD.board_project_id IS NOT NULL AND current_setting('evolve.board_cost_write',true)='on'
   AND (to_jsonb(NEW)-ARRAY['cost_options','cost_items','budget','currency','cost_version'])=(to_jsonb(OLD)-ARRAY['cost_options','cost_items','budget','currency','cost_version']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Manage shared project identity and costs in Board Room';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- statement-breakpoint
CREATE TABLE project_template_revision(revision integer PRIMARY KEY,definition jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO project_template_revision(revision,definition,created_by) VALUES(0,'{"fields":[]}','system');
CREATE TABLE project_template_config(id text PRIMARY KEY CHECK(id='primary'),draft jsonb NOT NULL DEFAULT '{"fields":[]}',version integer NOT NULL DEFAULT 1,published_revision integer NOT NULL DEFAULT 0 REFERENCES project_template_revision(revision));
INSERT INTO project_template_config(id) VALUES('primary');
CREATE TABLE project_template_audit(id text PRIMARY KEY,kind text NOT NULL,actor text NOT NULL,revision integer NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE project_template_sync_receipt(token text PRIMARY KEY,actor text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE FUNCTION protect_project_template_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published template revisions are immutable'; END $$;
CREATE TRIGGER immutable_project_template BEFORE UPDATE OR DELETE ON project_template_revision FOR EACH ROW EXECUTE FUNCTION protect_project_template_revision();
CREATE INDEX board_project_custom_values ON board_room_project USING gin((data->'customValues'));
