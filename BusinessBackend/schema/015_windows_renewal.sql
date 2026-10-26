-- Bind every settled Windows checkout to exactly one verified Square purchase.
-- Additive migration; must follow 014_windows_settlement.sql. No production
-- mutation or access enforcement is performed merely by applying this file.
ALTER TABLE kennelone_windows_checkout_links
  ADD COLUMN IF NOT EXISTS verified_purchase_id text;
CREATE UNIQUE INDEX IF NOT EXISTS kennelone_windows_one_checkout_per_purchase
  ON kennelone_windows_checkout_links(verified_purchase_id)
  WHERE verified_purchase_id IS NOT NULL;

CREATE OR REPLACE FUNCTION business_settle_windows_checkout(
 p_kennel uuid,p_order text,p_purchase_id text,p_plan text,
 p_state text,p_expires_at timestamptz,p_verified_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; checkout kennelone_windows_checkout_links; result_id uuid;
BEGIN
 actor:=NULLIF(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM kennel_memberships
   WHERE kennel_id=p_kennel AND user_id=actor AND role='owner')
  OR p_purchase_id IS NULL OR length(p_purchase_id)>256
  OR (p_plan IN ('monthly','annual') AND p_purchase_id NOT LIKE 'sqsub:%')
  OR (p_plan='lifetime' AND p_purchase_id NOT LIKE 'sqpay:%')
  OR p_plan NOT IN ('monthly','annual','lifetime') OR p_state<>'active'
  OR (p_plan<>'lifetime' AND (p_expires_at IS NULL OR p_expires_at<=now()))
  OR p_verified_at IS NULL OR p_verified_at>now()+interval '5 minutes'
 THEN RAISE EXCEPTION 'Invalid verified payment' USING ERRCODE='42501'; END IF;
 SELECT * INTO checkout FROM kennelone_windows_checkout_links
   WHERE kennel_id=p_kennel AND square_order_id=p_order AND user_id=actor FOR UPDATE;
 IF NOT FOUND OR checkout.plan<>p_plan OR checkout.state NOT IN ('pending','paid')
  OR (checkout.state='paid' AND checkout.verified_purchase_id IS DISTINCT FROM p_purchase_id)
  OR (checkout.verified_purchase_id IS NOT NULL AND checkout.verified_purchase_id<>p_purchase_id)
 THEN RAISE EXCEPTION 'Checkout purchase does not match owner' USING ERRCODE='42501'; END IF;
 INSERT INTO kennelone_purchase_entitlements
  (user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at)
 VALUES(actor,'windows',p_purchase_id,p_plan,p_state,p_expires_at,p_verified_at)
 ON CONFLICT(provider,provider_purchase_id) DO UPDATE SET
  plan=excluded.plan,state=excluded.state,valid_through=excluded.valid_through,
  verified_at=excluded.verified_at,updated_at=now()
 WHERE kennelone_purchase_entitlements.user_id=excluded.user_id
  AND excluded.verified_at>=kennelone_purchase_entitlements.verified_at
 RETURNING id INTO result_id;
 IF result_id IS NULL THEN
  RAISE EXCEPTION 'Payment already claimed by another account' USING ERRCODE='42501';
 END IF;
 UPDATE kennelone_windows_checkout_links SET
  state='paid',verified_purchase_id=p_purchase_id
 WHERE idempotency_key=checkout.idempotency_key;
 RETURN business_billing_status(p_kennel);
END $$;

-- Owner-scoped retrieval of a previously verified recurring checkout.
-- Does not return an entitlement to the browser: the API uses it exclusively
-- to verify the ORIGINAL Square payment and the MATCHING subscription anew.
CREATE OR REPLACE FUNCTION business_windows_subscription_for_refresh(p_kennel uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; checkout kennelone_windows_checkout_links;
BEGIN
 actor:=NULLIF(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM kennel_memberships
   WHERE kennel_id=p_kennel AND user_id=actor AND role='owner')
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT c.* INTO checkout FROM kennelone_windows_checkout_links c
 JOIN kennelone_purchase_entitlements e ON
  e.user_id=c.user_id AND e.provider='windows'
  AND e.provider_purchase_id=c.verified_purchase_id AND e.plan=c.plan
 WHERE c.kennel_id=p_kennel AND c.user_id=actor
  AND c.state='paid' AND c.plan IN ('monthly','annual')
  AND c.verified_purchase_id LIKE 'sqsub:%'
 ORDER BY c.created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('orderId',checkout.square_order_id,'plan',checkout.plan,
  'providerPurchaseId',checkout.verified_purchase_id,'createdAt',checkout.created_at);
END $$;

CREATE OR REPLACE FUNCTION business_refresh_windows_subscription(
 p_kennel uuid,p_purchase_id text,p_expires_at timestamptz,p_verified_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; entitlement kennelone_purchase_entitlements; checkout uuid;
BEGIN
 actor:=NULLIF(current_setting('request.user_id',true),'')::uuid;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM kennel_memberships
   WHERE kennel_id=p_kennel AND user_id=actor AND role='owner')
  OR p_purchase_id NOT LIKE 'sqsub:%' OR p_expires_at IS NULL OR p_expires_at<=now()
  OR p_verified_at IS NULL OR p_verified_at>now()+interval '5 minutes'
 THEN RAISE EXCEPTION 'Unverified renewal' USING ERRCODE='42501'; END IF;
 SELECT c.idempotency_key INTO checkout FROM kennelone_windows_checkout_links c
 WHERE c.kennel_id=p_kennel AND c.user_id=actor AND c.state='paid'
  AND c.plan IN ('monthly','annual') AND c.verified_purchase_id=p_purchase_id FOR UPDATE;
 IF checkout IS NULL THEN
  RAISE EXCEPTION 'Subscription not linked to this kennel' USING ERRCODE='42501'; END IF;
 SELECT * INTO entitlement FROM kennelone_purchase_entitlements e
 WHERE e.user_id=actor AND e.provider='windows' AND e.provider_purchase_id=p_purchase_id
  AND e.plan IN ('monthly','annual') FOR UPDATE;
 IF NOT FOUND OR p_expires_at<entitlement.valid_through OR
  p_verified_at<entitlement.verified_at THEN
  RAISE EXCEPTION 'Subscription renewal is stale or unrecognized' USING ERRCODE='42501'; END IF;
 UPDATE kennelone_purchase_entitlements SET
  valid_through=p_expires_at,verified_at=p_verified_at,state='active',updated_at=now()
 WHERE id=entitlement.id;
 RETURN business_billing_status(p_kennel);
END $$;
REVOKE ALL ON FUNCTION business_windows_subscription_for_refresh(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION business_refresh_windows_subscription(uuid,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_windows_subscription_for_refresh(uuid) TO kennelflow_api;
GRANT EXECUTE ON FUNCTION business_refresh_windows_subscription(uuid,text,timestamptz,timestamptz) TO kennelflow_api;
