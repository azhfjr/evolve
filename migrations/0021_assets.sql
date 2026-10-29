CREATE TABLE board_asset (
 id text PRIMARY KEY,
 code text NOT NULL UNIQUE CHECK (code=upper(trim(code)) AND code ~ '^[A-Z0-9][A-Z0-9._-]{0,79}$'),
 project_id text REFERENCES board_room_project(id) ON DELETE RESTRICT,
 data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX board_asset_project_idx ON board_asset(project_id,id);
-- statement-breakpoint
CREATE INDEX board_asset_name_idx ON board_asset(lower(data->>'name'));
-- statement-breakpoint
INSERT INTO board_asset(id,code,project_id,data)
 SELECT gen_random_uuid()::text,upper(trim(external_id)),id,
 jsonb_build_object('name',data->>'name','category',coalesce(data->>'category',''),'capacity',data->'capacity','unit',coalesce(data->>'unit',''),'location',coalesce(data->>'location',''),'voltage',coalesce(data->>'voltage',''))
 FROM board_room_project;
-- statement-breakpoint
CREATE TABLE asset_import_receipt(token text PRIMARY KEY, actor text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE TABLE asset_history(id text PRIMARY KEY,asset_id text NOT NULL,actor text NOT NULL,kind text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE FUNCTION asset_workspace_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE board_room_config SET revision=revision+1 WHERE id='primary';
 UPDATE workspace_setting SET revision=revision+1 WHERE id='primary';
 PERFORM pg_notify('evolve_changed','assets'); RETURN NULL;
END $$;
-- statement-breakpoint
CREATE TRIGGER asset_revision AFTER INSERT OR UPDATE OR DELETE ON board_asset FOR EACH STATEMENT EXECUTE FUNCTION asset_workspace_changed();
