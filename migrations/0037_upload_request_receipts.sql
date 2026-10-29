-- Retried upload preparation reuses allocation without duplicating retained bytes.
CREATE TABLE attachment_upload_receipt (
 owner_email text NOT NULL,
 request_id text NOT NULL,
 input_hash text NOT NULL,
 attachment_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_email,request_id)
);
