-- PostgreSQL schema for a shared KennelFlow account. Requires an authentication layer.
CREATE TABLE IF NOT EXISTS kennels (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kennel_memberships (
  kennel_id uuid NOT NULL REFERENCES kennels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','staff','viewer')),
  PRIMARY KEY (kennel_id,user_id)
);
CREATE TABLE IF NOT EXISTS kennel_records (
  id uuid NOT NULL,
  kennel_id uuid NOT NULL REFERENCES kennels(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  revision bigint NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (kennel_id,id)
);
CREATE INDEX IF NOT EXISTS kennel_records_changes ON kennel_records(kennel_id,updated_at,id);
CREATE TABLE IF NOT EXISTS kennel_attachments (
  id uuid PRIMARY KEY,
  kennel_id uuid NOT NULL REFERENCES kennels(id) ON DELETE CASCADE,
  record_id uuid NOT NULL,
  object_key text NOT NULL,
  media_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (kennel_id,record_id) REFERENCES kennel_records(kennel_id,id)
);
-- Authenticated service MUST set request.user_id after verifying the session.
-- Without a verified identity, policies deny all access.
ALTER TABLE kennels ENABLE ROW LEVEL SECURITY;
ALTER TABLE kennel_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE kennel_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE kennel_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY kennel_member_read ON kennels FOR SELECT USING (
  EXISTS (SELECT 1 FROM kennel_memberships m WHERE m.kennel_id = id AND m.user_id = nullif(current_setting('request.user_id',true),'')::uuid)
);
CREATE POLICY membership_self_read ON kennel_memberships FOR SELECT USING (user_id = nullif(current_setting('request.user_id',true),'')::uuid);
CREATE POLICY record_member_read ON kennel_records FOR SELECT USING (
  EXISTS (SELECT 1 FROM kennel_memberships m WHERE m.kennel_id = kennel_records.kennel_id AND m.user_id = nullif(current_setting('request.user_id',true),'')::uuid)
);
CREATE POLICY record_member_write ON kennel_records FOR ALL USING (
  EXISTS (SELECT 1 FROM kennel_memberships m WHERE m.kennel_id = kennel_records.kennel_id AND m.user_id = nullif(current_setting('request.user_id',true),'')::uuid AND m.role IN ('owner','admin','staff'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM kennel_memberships m WHERE m.kennel_id = kennel_records.kennel_id AND m.user_id = nullif(current_setting('request.user_id',true),'')::uuid AND m.role IN ('owner','admin','staff'))
);
CREATE POLICY attachment_member_read ON kennel_attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM kennel_memberships m WHERE m.kennel_id = kennel_attachments.kennel_id AND m.user_id = nullif(current_setting('request.user_id',true),'')::uuid)
);
CREATE POLICY attachment_member_write ON kennel_attachments FOR ALL USING (
  EXISTS (SELECT 1 FROM kennel_memberships m WHERE m.kennel_id = kennel_attachments.kennel_id AND m.user_id = nullif(current_setting('request.user_id',true),'')::uuid AND m.role IN ('owner','admin','staff'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM kennel_memberships m WHERE m.kennel_id = kennel_attachments.kennel_id AND m.user_id = nullif(current_setting('request.user_id',true),'')::uuid AND m.role IN ('owner','admin','staff'))
);

