-- Run after unified billing migration 012. The caller MUST validate the Apple
-- notification signature, the nested transaction JWS and live Apple store status.
-- Notifications cannot create paid entitlements or claim an unlinked purchase.
CREATE OR REPLACE FUNCTION business_reconcile_apple_event(
 p_event_id text,p_purchase_id text,p_plan text,p_state text,
 p_valid_through timestamptz,p_verified_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_purchase kennelone_purchase_entitlements; accepted text;
BEGIN
 IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 8 AND 128
   OR p_purchase_id IS NULL OR p_purchase_id !~ '^[0-9]{6,40}$'
   OR p_plan NOT IN ('monthly','annual','lifetime')
   OR p_state NOT IN ('active','grace','expired','revoked','refunded')
   OR p_verified_at IS NULL OR p_verified_at>now()+interval '5 minutes'
   OR (p_state IN ('active','grace') AND p_plan<>'lifetime'
       AND (p_valid_through IS NULL OR p_valid_through<=now()))
   OR (p_plan<>'lifetime' AND p_valid_through IS NULL)
 THEN RAISE EXCEPTION 'Invalid verified Apple event' USING ERRCODE='42501'; END IF;
 SELECT * INTO current_purchase FROM kennelone_purchase_entitlements
 WHERE provider='apple' AND provider_purchase_id=p_purchase_id FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('matched',false,'changed',false);
 END IF;
 -- Refunds and revocations are terminal for this verified purchase identity.
 -- A fresh purchase must be re-linked through an authenticated owner receipt.
 IF current_purchase.state IN ('refunded','revoked')
   AND p_state<>current_purchase.state THEN
  RETURN jsonb_build_object('matched',true,'changed',false,'requiresReview',true);
 END IF;
 IF p_verified_at<current_purchase.verified_at THEN
  RETURN jsonb_build_object('matched',true,'changed',false,'stale',true);
 END IF;
 INSERT INTO kennelone_billing_events(provider,provider_event_id,processed_at)
 VALUES('apple',p_event_id,now())
 ON CONFLICT(provider,provider_event_id) DO NOTHING
 RETURNING provider_event_id INTO accepted;
 IF accepted IS NULL THEN
  RETURN jsonb_build_object('matched',true,'changed',false,'duplicate',true);
 END IF;
 UPDATE kennelone_purchase_entitlements
 SET plan=p_plan,state=p_state,valid_through=CASE
   WHEN p_plan='lifetime' AND p_state='active' THEN NULL
   WHEN p_plan='lifetime' THEN now()
   ELSE p_valid_through END,
   verified_at=p_verified_at,updated_at=now()
 WHERE id=current_purchase.id;
 RETURN jsonb_build_object('matched',true,'changed',true,'state',p_state);
END $$;
REVOKE ALL ON FUNCTION business_reconcile_apple_event(text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_reconcile_apple_event(text,text,text,text,timestamptz,timestamptz) TO kennelflow_api;
