-- Additive migration: shared employee clock and append-only work history.
BEGIN;
ALTER TABLE business_invites ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS business_invites_id ON business_invites(id);
CREATE TABLE IF NOT EXISTS business_work_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 kennel_id uuid NOT NULL REFERENCES kennels(id), actor_id uuid NOT NULL,
 actor_name text NOT NULL, record_id uuid NOT NULL, record_type text NOT NULL,
 revision bigint NOT NULL, action text NOT NULL, title text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_work_history_kennel ON business_work_history(kennel_id,id DESC);
REVOKE ALL ON business_work_history FROM PUBLIC,kennelflow_api;
ALTER TABLE business_work_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION business_validate_time() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE person text; started timestamptz; ended timestamptz;
BEGIN
 IF NEW.record_type!='staffTimeEntries' OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 person:=lower(NEW.payload->'record'->>'staffID');
 BEGIN
  started:=(NEW.payload->'record'->>'clockIn')::timestamptz;
  ended:=nullif(NEW.payload->'record'->>'clockOut','')::timestamptz;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Valid clock times required' USING ERRCODE='23514'; END;
 IF person IS NULL OR person !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR started IS NULL OR NOT isfinite(started) OR (ended IS NOT NULL AND (NOT isfinite(ended) OR ended<started)) THEN
  RAISE EXCEPTION 'Valid employee and chronological clock times required' USING ERRCODE='23514';
 END IF;
 IF ended IS NULL AND EXISTS(SELECT 1 FROM kennel_records r WHERE r.kennel_id=NEW.kennel_id AND r.id!=NEW.id AND r.record_type='staffTimeEntries' AND r.deleted_at IS NULL AND lower(r.payload->'record'->>'staffID')=person AND nullif(r.payload->'record'->>'clockOut','') IS NULL) THEN
  RAISE EXCEPTION 'Employee already has an open time entry' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION business_validate_time() FROM PUBLIC;
DROP TRIGGER IF EXISTS business_validate_time ON kennel_records;
CREATE TRIGGER business_validate_time BEFORE INSERT OR UPDATE ON kennel_records FOR EACH ROW EXECUTE FUNCTION business_validate_time();
CREATE OR REPLACE FUNCTION business_track_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; label text; verb text;
BEGIN
 actor:=nullif(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL THEN RETURN NEW; END IF;
 SELECT coalesce(nullif(display_name,''),email) INTO label FROM app_users WHERE id=actor;
 verb:=CASE WHEN TG_OP='INSERT' THEN 'Created' WHEN NEW.deleted_at IS NOT NULL THEN 'Deleted'
 WHEN OLD.deleted_at IS NOT NULL THEN 'Restored'
 WHEN NEW.record_type='tasks' AND NEW.payload->'record'->>'completed'='true' AND OLD.payload->'record'->>'completed' IS DISTINCT FROM 'true' THEN 'Completed'
 ELSE 'Updated' END;
 INSERT INTO business_work_history(kennel_id,actor_id,actor_name,record_id,record_type,revision,action,title)
 VALUES(NEW.kennel_id,actor,coalesce(label,'Employee'),NEW.id,NEW.record_type,NEW.revision,verb,
 left(coalesce(nullif(NEW.payload->'record'->>'name',''),nullif(NEW.payload->'record'->>'title',''),nullif(NEW.payload->'record'->>'taskTitle',''),nullif(NEW.payload->'record'->>'staffName',''),NEW.record_type),240));
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION business_track_work() FROM PUBLIC;
DROP TRIGGER IF EXISTS business_track_work ON kennel_records;
CREATE TRIGGER business_track_work AFTER INSERT OR UPDATE ON kennel_records FOR EACH ROW EXECUTE FUNCTION business_track_work();

CREATE OR REPLACE FUNCTION business_history(p_kennel uuid,p_before bigint DEFAULT NULL)
RETURNS SETOF business_work_history LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role text; actor uuid;
BEGIN
 role:=business_role(p_kennel);actor:=nullif(current_setting('request.user_id',true),'')::uuid;
 IF role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT h.* FROM business_work_history h WHERE h.kennel_id=p_kennel
 AND (role IN ('owner','admin') OR h.actor_id=actor)
 AND (p_before IS NULL OR h.id<p_before) ORDER BY h.id DESC LIMIT 101;
END; $$;

CREATE OR REPLACE FUNCTION business_pending_invites(p_kennel uuid)
RETURNS TABLE(id uuid,email text,role text,expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(business_role(p_kennel),'') NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT i.id,i.email,i.role,i.expires_at FROM business_invites i WHERE i.kennel_id=p_kennel AND i.consumed_at IS NULL AND i.expires_at>now() ORDER BY i.created_at DESC;
END; $$;
CREATE OR REPLACE FUNCTION business_revoke_invite(p_kennel uuid,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor text; target text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_kennel::text,0));actor:=business_role(p_kennel);
 SELECT role INTO target FROM business_invites WHERE kennel_id=p_kennel AND id=p_id FOR UPDATE;
 IF actor IS NULL OR actor NOT IN ('owner','admin') OR target IS NULL OR (actor='admin' AND target='admin') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE business_invites SET consumed_at=now() WHERE kennel_id=p_kennel AND id=p_id;
END; $$;

-- Only this self-service function can create/update an employee's clock entry.
-- It serializes with sync writes and permission changes using the kennel lock.
CREATE OR REPLACE FUNCTION business_clock(p_kennel uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; role text; label text; entry kennel_records; ident uuid; stamp text; payload jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_kennel::text,0));
 actor:=nullif(current_setting('request.user_id',true),'')::uuid;role:=business_role(p_kennel);
 IF actor IS NULL OR coalesce(role,'') NOT IN ('owner','admin','staff') OR p_action NOT IN ('status','in','out') OR p_action IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO entry FROM kennel_records r WHERE r.kennel_id=p_kennel AND r.record_type='staffTimeEntries' AND r.deleted_at IS NULL
 AND lower(r.payload->'record'->>'staffID')=actor::text AND nullif(r.payload->'record'->>'clockOut','') IS NULL
 ORDER BY r.updated_at DESC LIMIT 1 FOR UPDATE;
 IF p_action='status' THEN RETURN jsonb_build_object('record',CASE WHEN entry.id IS NULL THEN NULL ELSE jsonb_build_object('id',entry.id,'type',entry.record_type,'revision',entry.revision,'data',entry.payload,'updated_at',entry.updated_at,'deleted_at',entry.deleted_at) END); END IF;
 stamp:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
 IF p_action='in' AND entry.id IS NULL THEN
  ident:=gen_random_uuid();SELECT coalesce(nullif(display_name,''),email) INTO label FROM app_users WHERE id=actor;
  payload:=jsonb_build_object('platform','ios','collection','staffTimeEntries','record',jsonb_build_object('id',ident,'staffID',actor,'staffName',label,'clockIn',stamp));
  INSERT INTO kennel_records(id,kennel_id,record_type,schema_version,revision,payload,updated_by) VALUES(ident,p_kennel,'staffTimeEntries',1,1,payload,actor) RETURNING * INTO entry;
 ELSIF p_action='out' AND entry.id IS NOT NULL THEN
  UPDATE kennel_records SET payload=jsonb_set(entry.payload,'{record,clockOut}',to_jsonb(stamp)),revision=revision+1,updated_at=now(),updated_by=actor WHERE id=entry.id AND kennel_id=p_kennel RETURNING * INTO entry;
 END IF;
 RETURN jsonb_build_object('record',CASE WHEN entry.id IS NULL THEN NULL ELSE jsonb_build_object('id',entry.id,'type',entry.record_type,'revision',entry.revision,'data',entry.payload,'updated_at',entry.updated_at,'deleted_at',entry.deleted_at) END);
END; $$;
REVOKE ALL ON FUNCTION business_history(uuid,bigint),business_pending_invites(uuid),business_revoke_invite(uuid,uuid),business_clock(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_history(uuid,bigint),business_pending_invites(uuid),business_revoke_invite(uuid,uuid),business_clock(uuid,text) TO kennelflow_api;
COMMIT;
