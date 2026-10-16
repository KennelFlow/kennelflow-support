-- Deployment hardening. Run as database owner after 001 and 002.
-- Explicit grants must be assigned to a narrowly scoped API role, not PUBLIC.
REVOKE ALL ON TABLE kennels, kennel_memberships, kennel_records, kennel_attachments FROM PUBLIC;
REVOKE ALL ON FUNCTION upsert_kennel_record(uuid,uuid,text,integer,bigint,jsonb,timestamptz) FROM PUBLIC;
-- FORCE ensures even a table owner is subject to row policies (superusers/BYPASSRLS excepted).
ALTER TABLE kennels FORCE ROW LEVEL SECURITY;
ALTER TABLE kennel_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE kennel_records FORCE ROW LEVEL SECURITY;
ALTER TABLE kennel_attachments FORCE ROW LEVEL SECURITY;
-- API role must not have BYPASSRLS or table ownership.
-- Membership enrollment and ownership transfer require a separately audited admin workflow.

