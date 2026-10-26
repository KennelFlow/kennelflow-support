-- Store-generated checkout links never confer access by themselves.
-- Paid access requires a separately verified Square payment/subscription event.
CREATE TABLE IF NOT EXISTS kennelone_windows_checkout_links (
 idempotency_key uuid PRIMARY KEY,
 kennel_id uuid NOT NULL REFERENCES kennels(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 plan text NOT NULL CHECK(plan IN ('monthly','annual','lifetime')),
 square_link_id text NOT NULL UNIQUE,
 square_order_id text NOT NULL UNIQUE,
 checkout_url text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','canceled','expired')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kennelone_one_pending_checkout_per_kennel
 ON kennelone_windows_checkout_links(kennel_id) WHERE state='pending';
REVOKE ALL ON kennelone_windows_checkout_links FROM PUBLIC,kennelflow_api;
ALTER TABLE kennelone_windows_checkout_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE kennelone_windows_checkout_links FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION business_pending_windows_checkout(p_kennel uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; pending kennelone_windows_checkout_links;
BEGIN
 actor:=NULLIF(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM kennel_memberships
  WHERE kennel_id=p_kennel AND user_id=actor AND role='owner')
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO pending FROM kennelone_windows_checkout_links
  WHERE kennel_id=p_kennel AND state='pending' LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('plan',pending.plan,'url',pending.checkout_url,
  'orderId',pending.square_order_id,'createdAt',pending.created_at);
END $$;
CREATE OR REPLACE FUNCTION business_save_windows_checkout(
 p_kennel uuid,p_plan text,p_key uuid,p_link_id text,p_order_id text,p_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; existing kennelone_windows_checkout_links;
BEGIN
 actor:=NULLIF(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM kennel_memberships
  WHERE kennel_id=p_kennel AND user_id=actor AND role='owner')
  OR p_plan NOT IN ('monthly','annual','lifetime') OR p_key IS NULL
  OR p_link_id IS NULL OR length(p_link_id)>256 OR p_order_id IS NULL OR length(p_order_id)>256
  OR p_url NOT LIKE 'https://%'
 THEN RAISE EXCEPTION 'Invalid checkout request' USING ERRCODE='42501'; END IF;
 INSERT INTO kennelone_windows_checkout_links
  (idempotency_key,kennel_id,user_id,plan,square_link_id,square_order_id,checkout_url)
 VALUES(p_key,p_kennel,actor,p_plan,p_link_id,p_order_id,p_url)
 ON CONFLICT(idempotency_key) DO NOTHING;
 SELECT * INTO existing FROM kennelone_windows_checkout_links WHERE idempotency_key=p_key;
 IF NOT FOUND OR existing.kennel_id<>p_kennel OR existing.user_id<>actor OR
  existing.plan<>p_plan OR existing.square_link_id<>p_link_id OR
  existing.square_order_id<>p_order_id OR existing.checkout_url<>p_url
 THEN RAISE EXCEPTION 'Checkout identity conflict' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('plan',existing.plan,'url',existing.checkout_url,
  'orderId',existing.square_order_id,'createdAt',existing.created_at);
END $$;
REVOKE ALL ON FUNCTION business_pending_windows_checkout(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION business_save_windows_checkout(uuid,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_pending_windows_checkout(uuid) TO kennelflow_api;
GRANT EXECUTE ON FUNCTION business_save_windows_checkout(uuid,text,uuid,text,text,text) TO kennelflow_api;
