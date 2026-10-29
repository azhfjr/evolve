CREATE TABLE board_creation_receipt(request_id text PRIMARY KEY,actor text NOT NULL,payload_hash text NOT NULL,project_id text NOT NULL REFERENCES board_room_project(id));
