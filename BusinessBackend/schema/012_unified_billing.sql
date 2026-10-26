-- Kennel One unified entitlement model. Apply after existing BusinessBackend migrations.
-- Payment processors may write only via a separate, verified server integration.
BEGIN;
CREATE TABLE IF NOT EXISTS kennelone_account_trials (
 user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT kennelone_trial_14d CHECK (ends_at=started_at+interval '14 days')
);
CREATE TABLE IF NOT EXISTS kennelone_purchase_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('apple','google','windows')),
 provider_purchase_id text NOT NULL,
 plan text NOT NULL CHECK(plan IN ('monthly','annual','lifetime')),
 state text NOT NULL CHECK(state IN ('active','grace','expired','refunded','revoked')),
 valid_through timestamptz,
 verified_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_purchase_id),
 CONSTRAINT ko_expiry_required CHECK (plan='lifetime' OR valid_through IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS kennelone_entitlement_user_state
 ON kennelone_purchase_entitlements(user_id,state,valid_through);
CREATE TABLE IF NOT EXISTS kennelone_billing_events (
 provider text NOT NULL CHECK(provider IN ('apple','google','windows')),
 provider_event_id text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 PRIMARY KEY(provider,provider_event_id)
);
-- App sessions can only query derived access; no direct reads/writes of purchases.
REVOKE ALL ON kennelone_account_trials,kennelone_purchase_entitlements,kennelone_billing_events FROM PUBLIC,kennelflow_api;
ALTER TABLE kennelone_account_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE kennelone_purchase_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE kennelone_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kennelone_account_trials FORCE ROW LEVEL SECURITY;
ALTER TABLE kennelone_purchase_entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE kennelone_billing_events FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION business_billing_status(p_kennel uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor uuid;
 owner_user uuid;
 purchase record;
 trial_end timestamptz;
BEGIN
 actor:=NULLIF(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM kennel_memberships m WHERE m.kennel_id=p_kennel AND m.user_id=actor)
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT m.user_id INTO owner_user FROM kennel_memberships m
  WHERE m.kennel_id=p_kennel AND m.role='owner' LIMIT 1;
 IF owner_user IS NULL THEN RETURN jsonb_build_object('active',false,'state','unpaid'); END IF;
 SELECT e.provider,e.plan,e.valid_through,e.state INTO purchase
 FROM kennelone_purchase_entitlements e
 WHERE e.user_id=owner_user AND e.state IN ('active','grace')
  AND (e.plan='lifetime' OR e.valid_through>now())
 ORDER BY (e.plan='lifetime') DESC,e.valid_through DESC NULLS LAST LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('active',true,'state',purchase.state,'plan',purchase.plan,
    'provider',purchase.provider,'validThrough',purchase.valid_through);
 END IF;
 SELECT t.ends_at INTO trial_end FROM kennelone_account_trials t
  WHERE t.user_id=owner_user AND t.ends_at>now();
 IF FOUND THEN RETURN jsonb_build_object('active',true,'state','trial','plan','trial',
 'provider','kennelone','validThrough',trial_end); END IF;
 RETURN jsonb_build_object('active',false,'state','unpaid');
END $$;
-- Signup and the initial trial are atomic. The restricted API role cannot
-- forge a second trial or directly insert a paid entitlement.
CREATE OR REPLACE FUNCTION business_signup_with_trial(p_email text,p_hash text,p_name text,p_kennel_name text,p_user uuid,p_kennel uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM business_create_kennel(p_email,p_hash,p_name,p_kennel_name,p_user,p_kennel);
 INSERT INTO kennelone_account_trials(user_id,started_at,ends_at)
 VALUES(p_user,now(),now()+interval '14 days');
END $$;
REVOKE ALL ON FUNCTION business_signup_with_trial(text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_signup_with_trial(text,text,text,text,uuid,uuid) TO kennelflow_api;
REVOKE ALL ON FUNCTION business_billing_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_billing_status(uuid) TO kennelflow_api;
COMMIT;

-- Only the server-side verified receipt endpoint may call this function.
-- Calls are constrained to the authenticated kennel owner and cannot transfer
-- an already-claimed transaction to a different Kennel One account.
CREATE OR REPLACE FUNCTION business_link_verified_purchase(
 p_kennel uuid, p_provider text, p_purchase_id text, p_plan text,
 p_state text, p_expires_at timestamptz, p_verified_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor uuid;
 record_id uuid;
BEGIN
 actor:=NULLIF(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS (
  SELECT 1 FROM kennel_memberships WHERE kennel_id=p_kennel AND user_id=actor AND role='owner'
 ) OR p_provider NOT IN ('apple','google','windows') OR
 p_plan NOT IN ('monthly','annual','lifetime') OR
 p_state NOT IN ('active','grace') OR
 p_purchase_id IS NULL OR length(p_purchase_id) NOT BETWEEN 3 AND 256 OR
 p_verified_at IS NULL OR p_verified_at>now()+interval '5 minutes' OR
 (p_plan<>'lifetime' AND (p_expires_at IS NULL OR p_expires_at<=now()))
 THEN RAISE EXCEPTION 'Unauthorized or inactive purchase' USING ERRCODE='42501'; END IF;
 INSERT INTO kennelone_purchase_entitlements(
  user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at)
 VALUES(actor,p_provider,p_purchase_id,p_plan,p_state,p_expires_at,p_verified_at)
 ON CONFLICT(provider,provider_purchase_id)
 DO UPDATE SET
  plan=excluded.plan,state=excluded.state,valid_through=excluded.valid_through,
  verified_at=excluded.verified_at,updated_at=now()
 WHERE kennelone_purchase_entitlements.user_id=excluded.user_id
   AND excluded.verified_at>=kennelone_purchase_entitlements.verified_at
 RETURNING id INTO record_id;
 IF record_id IS NULL
 THEN RAISE EXCEPTION 'Purchase already linked or older than stored verification' USING ERRCODE='42501'; END IF;
 RETURN business_billing_status(p_kennel);
END $$;
REVOKE ALL ON FUNCTION business_link_verified_purchase(uuid,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_link_verified_purchase(uuid,text,text,text,text,timestamptz,timestamptz) TO kennelflow_api;
