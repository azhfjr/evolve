CREATE TABLE asset_import_finding(id text PRIMARY KEY,actor text NOT NULL,source_hash text NOT NULL,message text NOT NULL,resolved boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX asset_import_finding_hash_idx ON asset_import_finding(source_hash,resolved);
