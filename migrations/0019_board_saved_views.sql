CREATE TABLE board_saved_view (
  id text PRIMARY KEY,
  owner_email text NOT NULL REFERENCES member(email),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  filters jsonb NOT NULL CHECK (jsonb_typeof(filters)='object'),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX board_saved_view_owner_name_idx ON board_saved_view(owner_email,lower(name));
