ALTER TABLE attachment
  ADD COLUMN storage_provider text CHECK (storage_provider IN ('local', 'blob', 'r2')),
  ADD COLUMN r2_copy_started_at timestamptz,
  ADD COLUMN blob_retained_until timestamptz,
  ADD COLUMN storage_sha256 text CHECK (storage_sha256 ~ '^[0-9a-f]{64}$');
CREATE INDEX attachment_blob_migration_idx ON attachment (id)
  WHERE state = 'ready' AND storage_provider = 'blob';
CREATE INDEX attachment_blob_retention_idx ON attachment (blob_retained_until)
  WHERE blob_retained_until IS NOT NULL;

CREATE TABLE attachment_r2_reconciliation (
  bucket text PRIMARY KEY,
  checked_at timestamptz NOT NULL,
  observed_bytes bigint NOT NULL CHECK (observed_bytes >= 0),
  mismatch_count integer NOT NULL CHECK (mismatch_count >= 0)
);

-- Allow physical relocation of archived bytes without allowing document edits.
CREATE OR REPLACE FUNCTION archive_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE physical_fields text[] := ARRAY[
  'storage_provider', 'r2_copy_started_at', 'blob_retained_until', 'storage_sha256'
];
BEGIN
  IF OLD.state='ready' AND EXISTS(
    SELECT 1 FROM legacy_record WHERE kind='attachment' AND id=OLD.id
  ) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archived documents are read-only'; END IF;
    IF (to_jsonb(NEW) - physical_fields) IS DISTINCT FROM (to_jsonb(OLD) - physical_fields)
    THEN RAISE EXCEPTION 'Archived documents are read-only'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
