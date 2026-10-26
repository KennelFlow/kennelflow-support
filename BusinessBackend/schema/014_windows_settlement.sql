-- Atomic checkout settlement. Only called after independent Square verification.
-- It refuses transfers of a Square subscription or payment to another Kennel One user.
CREATE OR REPLACE FUNCTION business_settle_windows_checkout(
 p_kennel uuid,p_order text,p_purchase_id text,p_plan text,
 p_state text,p_expires_at timestamptz,p_verified_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; pending kennelone_windows_checkout_links; result_id uuid;
BEGIN
 actor:=NULLIF(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM kennel_memberships
    WHERE kennel_id=p_kennel AND user_id=actor AND role='owner')
  OR p_purchase_id IS NULL OR length(p_purchase_id)>256
  OR p_plan NOT IN ('monthly','annual','lifetime') OR p_state <> 'active'
  OR (p_plan <> 'lifetime' AND (p_expires_at IS NULL OR p_expires_at<=now()))
  OR p_verified_at IS NULL OR p_verified_at > now()+interval '5 minutes'
 THEN RAISE EXCEPTION 'Invalid verified payment' USING ERRCODE='42501'; END IF;
 SELECT * INTO pending FROM kennelone_windows_checkout_links WHERE
  kennel_id=p_kennel AND square_order_id=p_order AND user_id=actor FOR UPDATE;
 IF NOT FOUND OR pending.plan<>p_plan OR pending.state NOT IN ('pending','paid')
 THEN RAISE EXCEPTION 'Checkout not owned by the account' USING ERRCODE='42501'; END IF;
 INSERT INTO kennelone_purchase_entitlements
  (user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at)
 VALUES(actor,'windows',p_purchase_id,p_plan,p_state,p_expires_at,p_verified_at)
 ON CONFLICT(provider,provider_purchase_id) DO UPDATE SET
  plan=excluded.plan,state=excluded.state,valid_through=excluded.valid_through,
  verified_at=excluded.verified_at,updated_at=now()
 WHERE kennelone_purchase_entitlements.user_id=excluded.user_id
  AND excluded.verified_at>=kennelone_purchase_entitlements.verified_at
 RETURNING id INTO result_id;
 IF result_id IS NULL
 THEN RAISE EXCEPTION 'Payment is already claimed by another account' USING ERRCODE='42501'; END IF;
 UPDATE kennelone_windows_checkout_links SET state='paid'
 WHERE idempotency_key=pending.idempotency_key AND state IN ('pending','paid');
 RETURN business_billing_status(p_kennel);
END $$;
REVOKE ALL ON FUNCTION business_settle_windows_checkout(uuid,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_settle_windows_checkout(uuid,text,text,text,text,timestamptz,timestamptz) TO kennelflow_api;
