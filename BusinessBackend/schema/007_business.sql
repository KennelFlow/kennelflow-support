-- Apply to an isolated branch first. Requires schemas 001 through 006 and kennelflow_api.
BEGIN;
ALTER TABLE kennel_records ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS business_invites (
 token_hash text PRIMARY KEY, kennel_id uuid NOT NULL REFERENCES kennels(id),
 email text NOT NULL, role text NOT NULL CHECK(role IN ('admin','staff','viewer')),
 invited_by uuid NOT NULL REFERENCES app_users(id), expires_at timestamptz NOT NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON business_invites FROM PUBLIC;
CREATE OR REPLACE FUNCTION business_role(p_kennel uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT role FROM kennel_memberships WHERE kennel_id=p_kennel
 AND user_id=nullif(current_setting('request.user_id',true),'')::uuid;
$$;
CREATE OR REPLACE FUNCTION business_record_access(p_kennel uuid,p_type text,p_write boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE
 WHEN business_role(p_kennel) IN ('owner','admin') THEN true
 WHEN p_write THEN business_role(p_kennel)='staff' AND p_type IN ('tasks','training','groomingRecords','kennelCareSessions','dailyDutyRecords')
 ELSE business_role(p_kennel) IN ('staff','viewer') AND p_type IN ('dogs','dog','healthRecords','tasks','training','kennels','groomingRecords','feedingPlans','supplementRecords','calendarEvents','employeeActivity','staffTimeEntries','kennelCareSessions','dailyDutyShifts','dailyDutyTemplates','dailyDutyRecords')
 END;
$$;
DROP POLICY IF EXISTS record_member_read ON kennel_records;
DROP POLICY IF EXISTS record_member_write ON kennel_records;
CREATE POLICY record_member_read ON kennel_records FOR SELECT USING (
 business_record_access(kennel_id,record_type,false) AND
 (record_type NOT IN ('employeeActivity','staffTimeEntries','kennelCareSessions')
 OR business_role(kennel_id) IN ('owner','admin')
 OR payload->'record'->>'staffID'=current_setting('request.user_id',true))
);
DROP POLICY IF EXISTS record_member_insert ON kennel_records;
DROP POLICY IF EXISTS record_member_update ON kennel_records;
CREATE POLICY record_member_insert ON kennel_records FOR INSERT WITH CHECK (
 business_record_access(kennel_id,record_type,true) AND
 (record_type!='kennelCareSessions' OR business_role(kennel_id) IN ('owner','admin')
 OR payload->'record'->>'staffID'=current_setting('request.user_id',true))
);
CREATE POLICY record_member_update ON kennel_records FOR UPDATE USING (
 business_record_access(kennel_id,record_type,true) AND
 (record_type!='kennelCareSessions' OR business_role(kennel_id) IN ('owner','admin')
 OR payload->'record'->>'staffID'=current_setting('request.user_id',true))
) WITH CHECK (
 business_record_access(kennel_id,record_type,true) AND
 (record_type!='kennelCareSessions' OR business_role(kennel_id) IN ('owner','admin')
 OR payload->'record'->>'staffID'=current_setting('request.user_id',true))
);
-- Legacy attachment rows must not bypass the new record permissions.
DROP POLICY IF EXISTS attachment_member_read ON kennel_attachments;
DROP POLICY IF EXISTS attachment_member_write ON kennel_attachments;
CREATE POLICY attachment_member_read ON kennel_attachments FOR SELECT USING (
 EXISTS(SELECT 1 FROM kennel_records r WHERE r.kennel_id=kennel_attachments.kennel_id AND r.id=kennel_attachments.record_id)
);
DROP POLICY IF EXISTS attachment_member_insert ON kennel_attachments;
DROP POLICY IF EXISTS attachment_member_update ON kennel_attachments;
CREATE POLICY attachment_member_insert ON kennel_attachments FOR INSERT WITH CHECK (business_role(kennel_id) IN ('owner','admin'));
CREATE POLICY attachment_member_update ON kennel_attachments FOR UPDATE USING (business_role(kennel_id) IN ('owner','admin')) WITH CHECK (business_role(kennel_id) IN ('owner','admin'));

CREATE OR REPLACE FUNCTION business_members(p_kennel uuid)
RETURNS TABLE(id uuid,email text,name text,role text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF business_role(p_kennel) NOT IN ('owner','admin') OR business_role(p_kennel) IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.email,u.display_name,m.role FROM kennel_memberships m JOIN app_users u ON u.id=m.user_id WHERE m.kennel_id=p_kennel ORDER BY u.email;
END; $$;
CREATE OR REPLACE FUNCTION business_invite(p_kennel uuid,p_email text,p_role text,p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_kennel::text,0));
 actor:=business_role(p_kennel);
 IF actor IS NULL OR actor NOT IN ('owner','admin') OR p_role NOT IN ('admin','staff','viewer') OR (actor='admin' AND p_role='admin') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM kennel_memberships m JOIN app_users u ON u.id=m.user_id WHERE m.kennel_id=p_kennel AND u.email=p_email) THEN RAISE EXCEPTION 'Already a member' USING ERRCODE='23505'; END IF;
 INSERT INTO business_invites(token_hash,kennel_id,email,role,invited_by,expires_at)
 VALUES(p_hash,p_kennel,p_email,p_role,nullif(current_setting('request.user_id',true),'')::uuid,now()+interval '48 hours');
END; $$;
CREATE OR REPLACE FUNCTION business_accept(p_hash text,p_email text,p_password_hash text,p_name text,p_new_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invitation business_invites; account app_users; inviter_role text;
BEGIN
 SELECT * INTO invitation FROM business_invites WHERE token_hash=p_hash FOR UPDATE;
 IF invitation.token_hash IS NULL OR invitation.email!=p_email OR invitation.consumed_at IS NOT NULL OR invitation.expires_at<=now() THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(invitation.kennel_id::text,0));
 SELECT role INTO inviter_role FROM kennel_memberships WHERE kennel_id=invitation.kennel_id AND user_id=invitation.invited_by;
 IF inviter_role IS NULL OR inviter_role NOT IN ('owner','admin') OR (inviter_role='admin' AND invitation.role='admin') THEN RAISE EXCEPTION 'Invitation revoked' USING ERRCODE='42501'; END IF;
 SELECT * INTO account FROM app_users WHERE email=p_email FOR UPDATE;
 IF account.id IS NULL THEN
  INSERT INTO app_users(id,email,password_hash,display_name) VALUES(p_new_id,p_email,p_password_hash,p_name) RETURNING * INTO account;
 ELSIF account.password_hash!=p_password_hash THEN
  RAISE EXCEPTION 'Sign in to existing account' USING ERRCODE='42501';
 END IF;
 INSERT INTO kennel_memberships(kennel_id,user_id,role) VALUES(invitation.kennel_id,account.id,invitation.role);
 UPDATE business_invites SET consumed_at=now() WHERE token_hash=p_hash;
 RETURN account.id;
END; $$;
CREATE OR REPLACE FUNCTION business_change_member(p_kennel uuid,p_user uuid,p_role text,p_remove boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor text; target text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_kennel::text,0));
 actor:=business_role(p_kennel);
 SELECT role INTO target FROM kennel_memberships WHERE kennel_id=p_kennel AND user_id=p_user FOR UPDATE;
 IF actor IS NULL OR target IS NULL OR target='owner' OR actor NOT IN ('owner','admin') OR p_role NOT IN ('admin','staff','viewer')
 OR (actor='admin' AND (target='admin' OR p_role='admin')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_remove THEN DELETE FROM kennel_memberships WHERE kennel_id=p_kennel AND user_id=p_user;
 ELSE UPDATE kennel_memberships SET role=p_role WHERE kennel_id=p_kennel AND user_id=p_user; END IF;
 -- End all existing sessions after a membership or permission change.
 DELETE FROM app_sessions WHERE user_id=p_user;
END; $$;
REVOKE ALL ON FUNCTION business_role(uuid),business_record_access(uuid,text,boolean),business_members(uuid),business_invite(uuid,text,text,text),business_accept(text,text,text,text,uuid),business_change_member(uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_role(uuid),business_record_access(uuid,text,boolean),business_members(uuid),business_invite(uuid,text,text,text),business_accept(text,text,text,text,uuid),business_change_member(uuid,uuid,text,boolean) TO kennelflow_api;
GRANT SELECT ON app_users TO kennelflow_api;
CREATE TABLE IF NOT EXISTS business_login_attempts(key text PRIMARY KEY,attempts integer NOT NULL,expires_at timestamptz NOT NULL);
REVOKE ALL ON business_login_attempts FROM PUBLIC;
CREATE OR REPLACE FUNCTION business_login_allowed(p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 DELETE FROM business_login_attempts WHERE expires_at<now();
 INSERT INTO business_login_attempts(key,attempts,expires_at) VALUES(p_key,1,now()+CASE WHEN p_key='global' THEN interval '1 minute' ELSE interval '15 minutes' END)
 ON CONFLICT(key) DO UPDATE SET attempts=business_login_attempts.attempts+1 RETURNING attempts INTO n;
 RETURN n<=CASE WHEN p_key='global' THEN 200 ELSE 20 END;
END; $$;
REVOKE ALL ON FUNCTION business_login_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_login_allowed(text) TO kennelflow_api;
CREATE OR REPLACE FUNCTION upsert_kennel_record(
  p_kennel_id uuid, p_id uuid, p_type text, p_schema_version integer,
  p_expected_revision bigint, p_payload jsonb, p_deleted_at timestamptz DEFAULT NULL
) RETURNS kennel_records LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE result kennel_records;
BEGIN
  IF p_type IS NULL OR length(trim(p_type)) = 0 OR p_schema_version < 1 OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid record';
  END IF;
  IF p_expected_revision = 0 THEN
    INSERT INTO kennel_records(id, kennel_id, record_type, schema_version, revision, payload, deleted_at, updated_by)
    VALUES (p_id, p_kennel_id, p_type, p_schema_version, 1, p_payload, p_deleted_at, nullif(current_setting('request.user_id',true),'')::uuid)
    ON CONFLICT DO NOTHING RETURNING * INTO result;
  ELSE
    UPDATE kennel_records SET updated_by=nullif(current_setting('request.user_id',true),'')::uuid, record_type=p_type, payload = p_payload, revision = revision + 1,
      schema_version = p_schema_version, deleted_at = p_deleted_at, updated_at = now()
    WHERE kennel_id = p_kennel_id AND id = p_id AND revision = p_expected_revision
      AND (record_type = p_type OR (record_type IN ('dog','android.Dogs') AND p_type='dogs')) RETURNING * INTO result;
  END IF;
  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = '40001';
  END IF;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION business_create_kennel(p_email text,p_hash text,p_name text,p_kennel_name text,p_user uuid,p_kennel uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF length(p_name)<1 OR length(p_kennel_name)<1 OR length(p_email)>254 THEN RAISE EXCEPTION 'Invalid account' USING ERRCODE='22023'; END IF;
 INSERT INTO app_users(id,email,password_hash,display_name) VALUES(p_user,p_email,p_hash,p_name);
 INSERT INTO kennels(id,name) VALUES(p_kennel,p_kennel_name);
 INSERT INTO kennel_memberships(kennel_id,user_id,role) VALUES(p_kennel,p_user,'owner');
END; $$;
CREATE OR REPLACE FUNCTION business_password(p_user uuid,p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_user IS DISTINCT FROM nullif(current_setting('request.user_id',true),'')::uuid THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE app_users SET password_hash=p_hash WHERE id=p_user;
 DELETE FROM app_sessions WHERE user_id=p_user;
END; $$;
REVOKE ALL ON FUNCTION business_create_kennel(text,text,text,text,uuid,uuid),business_password(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_create_kennel(text,text,text,text,uuid,uuid),business_password(uuid,text) TO kennelflow_api;
COMMIT;
