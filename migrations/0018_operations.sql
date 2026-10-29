-- Bounded operational state; no backup contents, file copies, or provider changes.
CREATE TABLE operations_state (
  id text PRIMARY KEY CHECK (id = 'primary'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  data jsonb NOT NULL DEFAULT '{"schemaVersion":1}'::jsonb
    CHECK (jsonb_typeof(data) = 'object' AND data ? 'schemaVersion' AND data->>'schemaVersion' = '1')
);
INSERT INTO operations_state(id) VALUES ('primary');
