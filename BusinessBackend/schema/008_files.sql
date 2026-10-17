BEGIN;
CREATE TABLE IF NOT EXISTS business_files (
 kennel_id uuid NOT NULL, record_id uuid NOT NULL, bytes bytea NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kennel_id,record_id),
 FOREIGN KEY(kennel_id,record_id) REFERENCES kennel_records(kennel_id,id),
 CHECK(octet_length(bytes)<=10485760)
);
ALTER TABLE business_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_files FORCE ROW LEVEL SECURITY;
REVOKE ALL ON business_files FROM PUBLIC;
DROP POLICY IF EXISTS business_file_read ON business_files;
DROP POLICY IF EXISTS business_file_insert ON business_files;
DROP POLICY IF EXISTS business_file_update ON business_files;
CREATE POLICY business_file_read ON business_files FOR SELECT USING (
 business_role(kennel_id) IN ('owner','admin') AND EXISTS(
 SELECT 1 FROM kennel_records r WHERE r.kennel_id=business_files.kennel_id AND r.id=business_files.record_id
 AND r.record_type IN ('documents','scannedReports') AND r.deleted_at IS NULL)
);
CREATE POLICY business_file_insert ON business_files FOR INSERT WITH CHECK (
 business_role(kennel_id) IN ('owner','admin') AND EXISTS(
 SELECT 1 FROM kennel_records r WHERE r.kennel_id=business_files.kennel_id AND r.id=business_files.record_id
 AND r.record_type IN ('documents','scannedReports') AND r.deleted_at IS NULL)
);
CREATE POLICY business_file_update ON business_files FOR UPDATE USING (
 business_role(kennel_id) IN ('owner','admin') AND EXISTS(
 SELECT 1 FROM kennel_records r WHERE r.kennel_id=business_files.kennel_id AND r.id=business_files.record_id
 AND r.record_type IN ('documents','scannedReports') AND r.deleted_at IS NULL)
) WITH CHECK (
 business_role(kennel_id) IN ('owner','admin') AND EXISTS(
 SELECT 1 FROM kennel_records r WHERE r.kennel_id=business_files.kennel_id AND r.id=business_files.record_id
 AND r.record_type IN ('documents','scannedReports') AND r.deleted_at IS NULL)
);
GRANT SELECT,INSERT,UPDATE ON business_files TO kennelflow_api;
COMMIT;
